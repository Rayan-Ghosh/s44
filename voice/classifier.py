"""
Voice Intent & Threat Classifier for S40.

Combines preprocessed transcription text with local NLP classification
to produce a normalized voice risk score and categorical scam flags.
"""

from typing import Dict, Any, Tuple
from ml.features.voice_features import VoiceFeatureExtractor
from voice.preprocessing import AudioPreprocessor


class VoiceClassifier:
    """
    Classifies social engineering call transcripts and calculates
    normalized voice risk scores.
    """

    def __init__(self, nlp_model_artifact: Any = None):
        self.preprocessor = AudioPreprocessor()
        self.feature_extractor = VoiceFeatureExtractor()
        self.nlp_model = nlp_model_artifact

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
        coercion = features.get("coercion_score", 0.0)
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
                overall_voice_risk = min(1.0, 0.5 * combined_score + 0.5 * model_pred)
            except Exception:
                overall_voice_risk = min(1.0, combined_score)
        else:
            overall_voice_risk = min(1.0, combined_score)

        # Categorical Flags
        urgency_detected = urgency >= 0.35 or "immediately" in clean_text or "now" in clean_text
        threat_detected = threat >= 0.35 or "police" in clean_text or "block" in clean_text
        authority_impersonation = authority >= 0.35 or "rbi" in clean_text or "manager" in clean_text
        credential_harvesting = phishing >= 0.35 or "otp" in clean_text or "pin" in clean_text

        return {
            "overall_voice_risk": float(overall_voice_risk),
            "flags": {
                "urgency_detected": bool(urgency_detected),
                "threat_detected": bool(threat_detected),
                "authority_impersonation": bool(authority_impersonation),
                "credential_harvesting": bool(credential_harvesting),
            },
            "features": features,
            "transcript_snippet": clean_text[:100],
        }
