"""
Stateful Fraud Detection Engine.

Analyzes streaming transcripts against high-risk Indian scam patterns
(Digital Arrest, Electricity KYC, AnyDesk/APK remote access, UPI PIN / OTP sharing).
Uses a Leaky Bucket accumulator and sliding window context for stateful risk scoring.
"""

import re
import time
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("fraud_detector")


class RiskState(str, Enum):
    NORMAL = "NORMAL"
    MONITORING = "MONITORING"
    FRAUD_ALERT = "FRAUD_ALERT"


@dataclass
class FraudAlertPayload:
    """JSON payload generated when call risk reaches FRAUD_ALERT state."""
    event: str = "FRAUD_ALERT"
    session_id: str = ""
    risk_score: int = 0
    detected_pattern: str = ""
    warning_message: str = ""
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event": self.event,
            "session_id": self.session_id,
            "risk_score": self.risk_score,
            "detected_pattern": self.detected_pattern,
            "warning_message": self.warning_message,
        }


# Lexicon Patterns (Romanized & Devanagari)
PATTERNS: Dict[str, Dict[str, Any]] = {
    "AUTHORITY_THREAT": {
        "weight": 25,
        "keywords_roman": [
            r"\bdigital\s+arrest\b",
            r"\bcbi\s+officer\b",
            r"\bsupreme\s+court\b",
            r"\btrai\b",
            r"\bsim\s+block\b",
            r"\bbijli\s+(connection|cut|kat|band)\b",
            r"\belectricity\s+(cut|cutoff|disconnect)\b",
            r"\bpolice\s+(station|warrant|officer)\b",
            r"\bcyber\s+(crime|cell)\b",
            r"\barrest\s+warrant\b",
            r"\blegal\s+action\b",
            r"\bcustoms\s+(department|confiscated)\b",
            r"\bpower\s+cut\b",
        ],
        "keywords_hindi": [
            r"डिजिटल\s*अरेस्ट",
            r"सीबीआई",
            r"सुप्रीम\s*कोर्ट",
            r"ट्राई",
            r"सीम\s*ब्लॉक",
            r"बिजली\s*(कनेक्शन|कट|बिल)",
            r"पुलिस\s*(स्टेशन|वारंट)",
            r"साइबर\s*सेल",
            r"अरेस्ट\s*वारंट",
        ],
    },
    "REMOTE_ACCESS": {
        "weight": 35,
        "keywords_roman": [
            r"\banydesk\b",
            r"\bteamviewer\b",
            r"\bquicksupport\b",
            r"\brustdesk\b",
            r"\bapk\s+(download|file|install)\b",
            r"\bscreen\s+share\b",
            r"\bdownload\s+app\b",
            r"\binstall\s+(app|apk)\b",
            r"\bplay\s*store\s*se\s*download\b",
            r"\bsupport\s+app\b",
        ],
        "keywords_hindi": [
            r"एनीडेस्क",
            r"टीमव्यूअर",
            r"क्विकसपोर्ट",
            r"रुस्टडेस्क",
            r"एपीके\s*(डाउनलोड|फाइल)",
            r"स्क्रीन\s*शेयर",
            r"ऐप\s*डाउनलोड",
            r"इंस्टॉल\s*करें",
        ],
    },
    "FINANCIAL_HARVESTING": {
        "weight": 35,
        "keywords_roman": [
            r"\botp\s+(batao|btao|share|enter|bhejo|tell)\b",
            r"\bcvv\b",
            r"\bupi\s+pin\b",
            r"\benter\s+pin\b",
            r"\bpin\s+(dalo|enter|batao)\b",
            r"\bqr\s+code\s+scan\b",
            r"\bscan\s+qr\b",
            r"\btransfer\s+money\b",
            r"\bpaisa\s+bhejo\b",
            r"\bcard\s+number\b",
            r"\bbank\s+account\b",
        ],
        "keywords_hindi": [
            r"ओटीपी\s*(बताओ|शेयर|भेजो)",
            r"सीवीवी",
            r"यूपीआई\s*पिन",
            r"पिन\s*(डालें|बताओ|एंटर)",
            r"क्यूआर\s*कोड\s*स्कैन",
            r"पैसा\s*भेजो",
            r"बैंक\s*खाता",
        ],
    },
}


class FraudRiskEngine:
    """
    Stateful Fraud Detector using Leaky Bucket risk accumulation:
    Risk(t) = max(0, gamma * Risk(t-1) + SemanticScore(t) + KeywordWeight)
    """

    def __init__(self, gamma: float = 0.85, window_seconds: float = 60.0):
        self.gamma = gamma
        self.window_seconds = window_seconds
        self.current_risk: float = 0.0
        self.current_state: RiskState = RiskState.NORMAL
        self.history: List[Dict[str, Any]] = []
        self.alert_triggered: bool = False

        # Compile regex patterns
        self.compiled_patterns: Dict[str, Dict[str, List[re.Pattern]]] = {}
        for category, cfg in PATTERNS.items():
            self.compiled_patterns[category] = {
                "roman": [re.compile(p, re.IGNORECASE) for p in cfg["keywords_roman"]],
                "hindi": [re.compile(p, re.IGNORECASE) for p in cfg["keywords_hindi"]],
                "weight": cfg["weight"],
            }

    def process_utterance(self, text: str, session_id: str = "") -> Tuple[RiskState, float, Optional[FraudAlertPayload]]:
        """
        Processes a transcript utterance, updates the leaky bucket risk accumulator,
        and evaluates state transitions.

        Returns:
            Tuple of (RiskState, current_risk_score, Optional[FraudAlertPayload])
        """
        now = time.time()
        text_clean = text.strip()

        if not text_clean:
            # Apply passive decay on empty / silent tick
            self.current_risk = max(0.0, self.gamma * self.current_risk)
            return self.current_state, round(self.current_risk, 2), None

        # Add to history
        self.history.append({"text": text_clean, "timestamp": now})
        self._prune_history(now)

        # 1. Match Keyword Triggers
        detected_categories: Dict[str, int] = {}
        keyword_weight = 0.0

        for category, data in self.compiled_patterns.items():
            matches = 0
            for pat in data["roman"] + data["hindi"]:
                if pat.search(text_clean):
                    matches += 1
            if matches > 0:
                detected_categories[category] = matches
                keyword_weight += data["weight"]

        # Also check historical context window for multi-phase escalation
        historical_categories = self._analyze_window_categories()
        combined_categories = set(detected_categories.keys()).union(historical_categories)

        # 2. Semantic Intent Escalation Score
        semantic_score = 0.0
        if len(combined_categories) == 2:
            semantic_score += 15.0
        elif len(combined_categories) >= 3:
            semantic_score += 20.0

        # 3. Leaky Bucket Formula: Risk(t) = max(0, gamma * Risk(t-1) + SemanticScore + KeywordWeight)
        new_risk = (self.gamma * self.current_risk) + semantic_score + keyword_weight
        self.current_risk = min(100.0, max(0.0, new_risk))

        # 4. State Machine Transition
        prev_state = self.current_state
        if self.current_risk >= 75.0:
            self.current_state = RiskState.FRAUD_ALERT
        elif self.current_risk >= 40.0:
            self.current_state = RiskState.MONITORING
        else:
            self.current_state = RiskState.NORMAL

        # 5. Alert Payload Generation
        alert_payload: Optional[FraudAlertPayload] = None
        if self.current_state == RiskState.FRAUD_ALERT and not self.alert_triggered:
            self.alert_triggered = True

            # Determine dominant detected pattern
            pattern_type = "SUSPICIOUS_CALL_PATTERNS"
            warning_msg = "Suspicious activity detected on the call. Do not share sensitive details."

            if "REMOTE_ACCESS" in combined_categories and "AUTHORITY_THREAT" in combined_categories:
                pattern_type = "REMOTE_ACCESS_COERCION"
                warning_msg = "Caller is attempting to induce panic and request AnyDesk/APK installation. Do not share OTPs."
            elif "FINANCIAL_HARVESTING" in combined_categories:
                pattern_type = "FINANCIAL_CREDENTIAL_EXTRACTION"
                warning_msg = "Caller is attempting to harvest UPI PIN, OTP, or CVV. Do not share financial credentials."
            elif "AUTHORITY_THREAT" in combined_categories:
                pattern_type = "AUTHORITY_IMPERSONATION"
                warning_msg = "Caller is claiming to be an official imposing Digital Arrest or utility cutoff. Verify caller identity."

            alert_payload = FraudAlertPayload(
                session_id=session_id,
                risk_score=int(round(self.current_risk)),
                detected_pattern=pattern_type,
                warning_message=warning_msg,
            )
            logger.warning(f"FRAUD_ALERT triggered for session {session_id}! Risk: {self.current_risk:.1f}")

        return self.current_state, round(self.current_risk, 2), alert_payload

    def _prune_history(self, now: float) -> None:
        """Keeps only history within sliding window_seconds."""
        cutoff = now - self.window_seconds
        self.history = [item for item in self.history if item["timestamp"] >= cutoff]

    def _analyze_window_categories(self) -> set:
        """Analyzes all text in the sliding 60-second window for pattern categories."""
        found = set()
        for item in self.history:
            txt = item["text"]
            for category, data in self.compiled_patterns.items():
                for pat in data["roman"] + data["hindi"]:
                    if pat.search(txt):
                        found.add(category)
                        break
        return found

    def reset(self) -> None:
        self.current_risk = 0.0
        self.current_state = RiskState.NORMAL
        self.history.clear()
        self.alert_triggered = False
