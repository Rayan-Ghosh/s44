"""
Voice Intent & Threat Classifier for S40.

Combines preprocessed transcription text with local NLP classification
to produce a normalized voice risk score and categorical scam flags.
"""

from typing import Dict, Any, Tuple
from ml.features.voice_features import VoiceFeatureExtractor, _is_negated
from voice.preprocessing import AudioPreprocessor


import os
import joblib

MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ml", "models"))
DEFAULT_NLP_PATH = os.path.join(MODEL_DIR, "voice_nlp.joblib")


class VoiceClassifier:
    """
    Classifies social engineering call transcripts and calculates
    normalized voice risk scores.
    """

    def __init__(self, nlp_model_artifact: Any = None):
        self.preprocessor = AudioPreprocessor()
        self.feature_extractor = VoiceFeatureExtractor()
        self.nlp_model = nlp_model_artifact
        if self.nlp_model is None and os.path.exists(DEFAULT_NLP_PATH):
            try:
                self.nlp_model = joblib.load(DEFAULT_NLP_PATH)
            except Exception:
                self.nlp_model = None

    def classify_transcript(self, raw_transcript: str) -> Dict[str, Any]:
        """
        Processes call transcript, computes linguistic features, and outputs
        overall voice_risk_score with categorical risk flags.

        Args:
            raw_transcript: Transcribed string from speech-to-text.

        Returns:
            Dict containing overall_voice_risk, categorical flags, and feature breakdowns.
        """
        clean_text = self.preprocessor.normalize_transcript(raw_transcript)
        features = self.feature_extractor.extract_features_from_text(clean_text)

        # 1. Feature weights for overall voice risk score
        urgency = features.get("urgency_score", 0.0)
        threat = features.get("threat_score", 0.0)
        authority = features.get("authority_impersonation_score", 0.0)
        financial = features.get("financial_request_score", 0.0)
        phishing = features.get("phishing_score", 0.0)

        # Combined heuristic NLP score (0.0 to 1.0)
        combined_score = (
            0.25 * urgency
            + 0.25 * threat
            + 0.20 * authority
            + 0.15 * financial
            + 0.15 * phishing
        )

        # If trained ML model exists, blend predictions
        if self.nlp_model is not None:
            try:
                model_pred = float(self.nlp_model.predict_proba([clean_text])[0][1])
                overall_voice_risk = min(1.0, 0.4 * combined_score + 0.6 * model_pred)
            except Exception:
                overall_voice_risk = min(1.0, combined_score)
        else:
            overall_voice_risk = min(1.0, combined_score)

        # A raw substring check ("otp" in clean_text) can't tell a demand
        # ("share your OTP") from a warning ("don't share your OTP") apart —
        # confirmed live: a caller telling the user to protect their OTP/PIN
        # was flagged identically to a caller asking for it. This helper
        # applies the same negation-window check the feature extractor uses,
        # so a keyword only counts here if it isn't immediately preceded by
        # a negation marker.
        def _keyword_present(kw: str) -> bool:
            idx = clean_text.find(kw)
            return idx != -1 and not _is_negated(clean_text, idx)

        # Categorical Flags & Active Threat Dimensions
        urgency_detected = urgency >= 0.35 or _keyword_present("immediately") or _keyword_present("now")
        threat_detected = threat >= 0.35 or _keyword_present("police") or _keyword_present("block") or _keyword_present("arrest")
        authority_impersonation = authority >= 0.35 or _keyword_present("rbi") or _keyword_present("cbi") or _keyword_present("manager")
        credential_harvesting = phishing >= 0.35 or _keyword_present("otp") or _keyword_present("pin")

        active_dimensions = []
        if urgency_detected: active_dimensions.append("URGENCY")
        if threat_detected: active_dimensions.append("LEGAL_THREAT")
        if authority_impersonation: active_dimensions.append("AUTHORITY_IMPERSONATION")
        if financial >= 0.35: active_dimensions.append("FINANCIAL_EXTRACTION")
        if credential_harvesting: active_dimensions.append("CREDENTIAL_HARVESTING")

        matched_phrases = []
        for kw in ["cbi", "police", "arrest", "digital arrest", "immediately", "block", "freeze", "now", "otp", "pin", "fine", "narcotics", "court", "anydesk", "warrant", "charges"]:
            if _keyword_present(kw):
                matched_phrases.append(kw)

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
            "features": features,
            "transcript_snippet": clean_text[:100],
        }

