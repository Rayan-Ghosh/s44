"""
Voice & Social Engineering Feature Extractor for S40 Fraud Shield.

Extracts normalized linguistic risk markers from transcribed audio text:
1. Urgency score (immediate action keywords: now, 5 minutes, quick).
2. Threat score (coercion/punishment keywords: police, block account, arrest, legal).
3. Authority impersonation score (official role keywords: RBI, manager, police, officer).
4. Financial demand score (payment action keywords: transfer, pay, send money).
5. Coercion score (composite of threat + urgency + financial demand).
6. Credential harvesting score (OTP, PIN, CVV, password requests).
"""

import re
from typing import Dict, Any, List


# Linguistic Keyword Lexicons tailored to Indian banking scam patterns
URGENCY_KEYWORDS = [
    r"\bimmediately\b", r"\bnow\b", r"\bwithin \d+ minute", r"\bhurry\b",
    r"\bquick\b", r"\burgent\b", r"\bexpir", r"\bblock in \d+", r"\btoday itself\b"
]

THREAT_KEYWORDS = [
    r"\bpolice\b", r"\barrest\b", r"\blegal action\b", r"\bcourt\b",
    r"\bfreeze\b", r"\bblock\b", r"\bpenalty\b", r"\bfine\b", r"\bcomplaint\b",
    r"\bcriminal\b", r"\bsuspension\b", r"\bwarrant\b"
]

AUTHORITY_KEYWORDS = [
    r"\brbi\b", r"\bbank manager\b", r"\bcyber cell\b", r"\bincome tax\b",
    r"\bofficer\b", r"\bpolice officer\b", r"\bhead office\b", r"\bcustomer care\b",
    r"\bpolice station\b", r"\bgovernment\b"
]

FINANCIAL_KEYWORDS = [
    r"\btransfer\b", r"\bsend money\b", r"\bpay\b", r"\bupi\b", r"\baccount number\b",
    r"\bdeposit\b", r"\brefund\b", r"\bfee\b", r"\bcharges\b", r"\bverification amount\b"
]

CREDENTIAL_KEYWORDS = [
    r"\botp\b", r"\bpin\b", r"\bcvv\b", r"\bpassword\b", r"\bcard number\b",
    r"\bsecret code\b", r"\bnet banking password\b"
]


class VoiceFeatureExtractor:
    """
    Rule-assisted NLP feature extractor for voice call transcriptions.
    """

    FEATURE_NAMES = [
        "urgency_score",
        "threat_score",
        "authority_impersonation_score",
        "financial_request_score",
        "coercion_score",
        "phishing_score",
    ]

    def extract_features_from_text(self, text: str) -> Dict[str, float]:
        """
        Computes social engineering risk scores from transcribed call string.

        Args:
            text: Transcribed audio text.

        Returns:
            Dict containing normalized 0.0 to 1.0 risk attribute scores.
        """
        if not text:
            return {name: 0.0 for name in self.FEATURE_NAMES}

        lower_text = text.lower()

        def compute_lexicon_density(lexicon: List[str]) -> float:
            matches = 0
            for pattern in lexicon:
                if re.search(pattern, lower_text):
                    matches += 1
            if not lexicon:
                return 0.0
            # Saturated ratio mapping 1-3 matches to 0.4 - 1.0
            return min(1.0, matches * 0.35)

        urgency = compute_lexicon_density(URGENCY_KEYWORDS)
        threat = compute_lexicon_density(THREAT_KEYWORDS)
        authority = compute_lexicon_density(AUTHORITY_KEYWORDS)
        financial = compute_lexicon_density(FINANCIAL_KEYWORDS)
        phishing = compute_lexicon_density(CREDENTIAL_KEYWORDS)

        # Composite Coercion Score: weighted combination of threat, urgency, and financial demand
        coercion = min(1.0, 0.4 * threat + 0.35 * urgency + 0.25 * financial)

        return {
            "urgency_score": float(urgency),
            "threat_score": float(threat),
            "authority_impersonation_score": float(authority),
            "financial_request_score": float(financial),
            "coercion_score": float(coercion),
            "phishing_score": float(phishing),
        }

    def extract_features(
        self, transaction: Dict[str, Any], user_profile: Dict[str, Any]
    ) -> Dict[str, float]:
        """
        Extracts voice features from transaction payload (which may contain a
        transcribed call string or direct voice score dictionary).
        """
        voice_payload = transaction.get("voice_analysis", transaction.get("voice_transcript", ""))
        
        if isinstance(voice_payload, dict):
            # Already extracted dict passed in payload
            return {
                "urgency_score": float(voice_payload.get("urgency", voice_payload.get("urgency_score", 0.0))),
                "threat_score": float(voice_payload.get("threat", voice_payload.get("threat_score", 0.0))),
                "authority_impersonation_score": float(voice_payload.get("authority_impersonation", voice_payload.get("authority_impersonation_score", 0.0))),
                "financial_request_score": float(voice_payload.get("financial_request", voice_payload.get("financial_request_score", 0.0))),
                "coercion_score": float(voice_payload.get("coercion", voice_payload.get("coercion_score", 0.0))),
                "phishing_score": float(voice_payload.get("phishing", voice_payload.get("phishing_score", 0.0))),
            }
        elif isinstance(voice_payload, str):
            return self.extract_features_from_text(voice_payload)
        
        return {name: 0.0 for name in self.FEATURE_NAMES}
