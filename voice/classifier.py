"""
Voice Intent & Threat Classifier for S40.

Combines preprocessed transcription text with multilingual Aho-Corasick trie matching,
local NLP classification, and static active-defense Columbo trap prompts.
"""

import os
import re
from typing import Dict, Any, Tuple, List, Optional
import joblib

from ml.features.voice_features import VoiceFeatureExtractor, _is_negated
from voice.preprocessing import AudioPreprocessor
from ml.nlp.aho_corasick_trie import AhoCorasickTrie, TrieMatch
from ml.nlp.code_mixed_normalizer import CodeMixedNormalizer
from engine.copilot.static_trap_prompts import get_trap_prompt

MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ml", "models"))
DEFAULT_NLP_PATH = os.path.join(MODEL_DIR, "voice_nlp.joblib")


class VoiceClassifier:
    """
    Classifies multilingual social engineering call transcripts (Hindi, Bengali, Odia, English)
    and calculates normalized voice risk scores within strict latency budgets (<50ms).
    """

    def __init__(self, nlp_model_artifact: Any = None):
        self.preprocessor = AudioPreprocessor()
        self.feature_extractor = VoiceFeatureExtractor()
        self.nlp_model = nlp_model_artifact
        self.trie = AhoCorasickTrie()
        self.normalizer = CodeMixedNormalizer()

        if self.nlp_model is None and os.path.exists(DEFAULT_NLP_PATH):
            try:
                self.nlp_model = joblib.load(DEFAULT_NLP_PATH)
            except Exception:
                self.nlp_model = None

    def _detect_dominant_language(self, text: str) -> str:
        """Heuristically detects Indic script or falls back to English."""
        for ch in text:
            code = ord(ch)
            if 0x0980 <= code <= 0x09FF:
                return "bn"
            if 0x0900 <= code <= 0x097F:
                return "hi"
            if 0x0B00 <= code <= 0x0B7F:
                return "or"
        return "en"

    def classify_transcript(self, raw_transcript: str) -> Dict[str, Any]:
        """
        Processes call transcript, computes linguistic features, searches multilingual
        trie automaton, and outputs overall voice_risk_score with categorical risk flags.

        Args:
            raw_transcript: Transcribed string from speech-to-text.

        Returns:
            Dict containing overall_voice_risk, categorical flags, active threat dimensions,
            matched phrases, and active defense Columbo trap prompts.
        """
        norm_text = self.normalizer.normalize(raw_transcript)
        clean_text = self.preprocessor.normalize_transcript(raw_transcript)
        features = self.feature_extractor.extract_features_from_text(clean_text)

        # 1. Feature weights for baseline English heuristic NLP score
        urgency = features.get("urgency_score", 0.0)
        threat = features.get("threat_score", 0.0)
        authority = features.get("authority_impersonation_score", 0.0)
        financial = features.get("financial_request_score", 0.0)
        phishing = features.get("phishing_score", 0.0)

        combined_score = (
            0.25 * urgency
            + 0.25 * threat
            + 0.20 * authority
            + 0.15 * financial
            + 0.15 * phishing
        )

        # 2. Multilingual Aho-Corasick Trie Search across Indic scripts and code-mixed Latin
        trie_matches: List[TrieMatch] = self.trie.search(norm_text)
        canonical_text = self.normalizer.canonicalize_roman(norm_text)
        if canonical_text and canonical_text != norm_text:
            canon_matches = self.trie.search(canonical_text)
            for cm in canon_matches:
                if not any(tm.keyword == cm.keyword and tm.category == cm.category for tm in trie_matches):
                    trie_matches.append(cm)

        # Filter out negated matches using the extended negation window
        valid_trie_matches: List[TrieMatch] = []
        for m in trie_matches:
            # Check in norm_text or fallback to canonical_text
            if not _is_negated(norm_text, m.start, m.end):
                valid_trie_matches.append(m)

        # 3. Aggregate Multilingual Trie Intent & Weight Boost
        trie_categories = set()
        trie_dimensions = set()
        trie_phrases = []
        trie_weight_sum = 0.0

        for tm in valid_trie_matches:
            trie_categories.add(tm.category)
            trie_dimensions.add(tm.threat_dimension)
            if tm.keyword not in trie_phrases:
                trie_phrases.append(tm.keyword)
            trie_weight_sum += tm.weight

        # Normalize trie risk score (capped at 1.0)
        trie_risk = min(1.0, (trie_weight_sum / 100.0) * 1.5) if valid_trie_matches else 0.0

        # Combine heuristic score with trie risk
        heuristic_score = max(combined_score, trie_risk)

        # 4. If trained ML model exists, blend predictions
        if self.nlp_model is not None:
            try:
                model_pred = float(self.nlp_model.predict_proba([clean_text])[0][1])
                overall_voice_risk = min(1.0, 0.4 * heuristic_score + 0.6 * model_pred)
            except Exception:
                overall_voice_risk = min(1.0, heuristic_score)
        else:
            overall_voice_risk = min(1.0, heuristic_score)

        # 5. Helper for checking specific keywords with negation check
        def _keyword_present(kw: str) -> bool:
            idx = norm_text.find(kw)
            if idx != -1 and not _is_negated(norm_text, idx, idx + len(kw)):
                return True
            idx2 = clean_text.find(kw)
            return idx2 != -1 and not _is_negated(clean_text, idx2, idx2 + len(kw))

        # 6. Categorical Flags & Active Threat Dimensions
        urgency_detected = (
            urgency >= 0.35
            or "URGENCY" in trie_dimensions
            or "ELECTRICITY_CUTOFF" in trie_categories
            or _keyword_present("immediately")
            or _keyword_present("now")
        )
        threat_detected = (
            threat >= 0.35
            or "LEGAL_THREAT" in trie_dimensions
            or "DIGITAL_ARREST_POLICE" in trie_categories
            or "CHILD_CUSTODY_EXTORTION" in trie_categories
            or _keyword_present("police")
            or _keyword_present("block")
            or _keyword_present("arrest")
        )
        authority_impersonation = (
            authority >= 0.35
            or "AUTHORITY_IMPERSONATION" in trie_dimensions
            or "CUSTOMS_PARCEL_SEIZURE" in trie_categories
            or _keyword_present("rbi")
            or _keyword_present("cbi")
            or _keyword_present("manager")
        )
        credential_harvesting = (
            phishing >= 0.35
            or "CREDENTIAL_HARVESTING" in trie_dimensions
            or _keyword_present("otp")
            or _keyword_present("pin")
        )

        active_dimensions = []
        if urgency_detected: active_dimensions.append("URGENCY")
        if threat_detected: active_dimensions.append("LEGAL_THREAT")
        if authority_impersonation: active_dimensions.append("AUTHORITY_IMPERSONATION")
        if financial >= 0.35 or "KYC_ACCOUNT_FREEZE" in trie_categories:
            active_dimensions.append("FINANCIAL_EXTRACTION")
        if credential_harvesting: active_dimensions.append("CREDENTIAL_HARVESTING")

        # Merge matched phrases (legacy English keywords + trie matches)
        matched_phrases = list(trie_phrases)
        legacy_kws = ["cbi", "police", "arrest", "digital arrest", "immediately", "block", "freeze", "now", "otp", "pin", "fine", "narcotics", "court", "anydesk", "warrant", "charges"]
        for kw in legacy_kws:
            if _keyword_present(kw) and kw not in matched_phrases:
                matched_phrases.append(kw)

        # 7. Static Columbo Protocol Trap Prompt Generation
        lang = self._detect_dominant_language(clean_text)
        columbo_trap_prompt: Optional[str] = None

        if overall_voice_risk >= 0.35 and trie_categories:
            # Prioritize Digital Arrest or Child Custody per spec §2 Task 6
            priority_order = [
                "DIGITAL_ARREST_POLICE",
                "CHILD_CUSTODY_EXTORTION",
                "ELECTRICITY_CUTOFF",
                "KYC_ACCOUNT_FREEZE",
                "CUSTOMS_PARCEL_SEIZURE"
            ]
            selected_cat = next((cat for cat in priority_order if cat in trie_categories), list(trie_categories)[0])
            columbo_trap_prompt = get_trap_prompt(selected_cat, language=lang)

        return {
            "overall_voice_risk": float(overall_voice_risk),
            "flags": {
                "urgency_detected": bool(urgency_detected),
                "threat_detected": bool(threat_detected),
                "authority_impersonation": bool(authority_impersonation),
                "credential_harvesting": bool(credential_harvesting),
            },
            "active_threat_dimensions": active_dimensions,
            "matched_phrases": matched_phrases,
            "scam_categories": sorted(list(trie_categories)),
            "columbo_trap_prompt": columbo_trap_prompt,
            "language_detected": lang,
            "features": features,
            "transcript_snippet": clean_text[:100],
        }
