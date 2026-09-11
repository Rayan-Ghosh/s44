"""
AVARAN Adaptive Defense Copilot (Columbo Protocol v2).

Dynamically generates targeted adversarial challenges and verification prompts
based on the live multimodal threat matrix:
- Synthetic voice detected -> Voice Liveness / Phonetic Challenge
- Visual deepfake detected -> Head Orientation / Camera Movement Challenge
- Digital arrest / Authority fraud -> Phantom Badge & Administrative Dead-End Inquiries
"""

from typing import Dict, Any, List, Optional
from engine.copilot.static_trap_prompts import get_trap_prompt, TRAP_PROMPTS


class AdaptiveCopilot:
    """
    Adaptive counter-inquiry copilot that prescribes context-sensitive challenges
    to dismantle social engineering dominance during live suspicious calls.
    """

    CHALLENGES: Dict[str, Dict[str, str]] = {
        "VOICE_LIVENESS_CHALLENGE": {
            "en": "Voice anomaly detected: Please ask the caller to state today's date and the word 'AVARAN' aloud.",
            "hi": "आवाज़ में गड़बड़ी: कॉलर से आज की तारीख और 'अवारन' शब्द बोलने को कहें।",
            "bn": "কণ্ঠস্বরে অস্বাভাবিকতা: কলারকে আজকের তারিখ এবং 'আভরণ' শব্দটি উচ্চারণ করতে বলুন।",
        },
        "VISUAL_LIVENESS_CHALLENGE": {
            "en": "Video manipulation detected: Ask the caller to wave their hand in front of their face or turn their head 90 degrees.",
            "hi": "वीडियो में छेड़छाड़: कॉलर से अपना चेहरा 90 डिग्री घुमाने या चेहरे के आगे हाथ हिलाने को कहें।",
            "bn": "ভিডিওতে গরমিল: কলারকে তার মুখ একপাশে ঘোরাতে অথবা মুখের সামনে হাত নাড়তে বলুন।",
        },
        "BACKGROUND_LOOP_CHALLENGE": {
            "en": "Fake background detected: Ask the caller to pan their camera around the police station room.",
            "hi": "नकली बैकग्राउंड: कॉलर से कहें कि वह कैमरा घुमाकर पूरा पुलिस स्टेशन दिखाए।",
            "bn": "নকল ব্যাকগ্রাউন্ড: কলারকে ক্যামেরা ঘুরিয়ে চারপাশের থানা ঘর দেখাতে বলুন।",
        },
    }

    def evaluate_response_strategy(
        self,
        risk_score: int,
        scam_categories: List[str] = None,
        is_synthetic_voice: bool = False,
        is_deepfake: bool = False,
        visual_threat_flags: List[str] = None,
        language: str = "en",
    ) -> Dict[str, Any]:
        """
        Synthesizes multimodal alerts into prioritized counter-inquiry guidance.

        Returns:
            Dict containing:
                - recommended_challenge: str
                - escalation_action: str ('NONE', 'PROMPT_CHALLENGE', 'TERMINATE_CALL')
                - explanation: str
        """
        categories = scam_categories or []
        vis_flags = visual_threat_flags or []
        lang = language if language in ("en", "hi", "bn") else "en"

        # 1. Critical visual deepfake priority
        if is_deepfake or "SYNTHETIC_FACE_BOUNDARY_WARPING" in vis_flags or "UNNATURAL_BLINK_ABSENCE" in vis_flags:
            return {
                "recommended_challenge": self.CHALLENGES["VISUAL_LIVENESS_CHALLENGE"][lang],
                "challenge_type": "VISUAL_LIVENESS",
                "escalation_action": "PROMPT_CHALLENGE" if risk_score < 75 else "TERMINATE_CALL",
                "explanation": "Visual deepfake artifacts detected in video stream.",
            }

        # 2. Fake background loop priority
        if "LOOPED_BACKGROUND_FEED" in vis_flags:
            return {
                "recommended_challenge": self.CHALLENGES["BACKGROUND_LOOP_CHALLENGE"][lang],
                "challenge_type": "BACKGROUND_PAN",
                "escalation_action": "PROMPT_CHALLENGE",
                "explanation": "Looped background video detected.",
            }

        # 3. Synthetic voice liveness priority
        if is_synthetic_voice:
            return {
                "recommended_challenge": self.CHALLENGES["VOICE_LIVENESS_CHALLENGE"][lang],
                "challenge_type": "VOICE_LIVENESS",
                "escalation_action": "PROMPT_CHALLENGE",
                "explanation": "Synthetic or cloned audio stream detected.",
            }

        # 4. Linguistic scam intent traps (Columbo Protocol)
        if categories:
            trap = get_trap_prompt(categories[0], language=lang)
            if trap:
                return {
                    "recommended_challenge": trap,
                    "challenge_type": "ADMINISTRATIVE_DEADEND",
                    "escalation_action": "PROMPT_CHALLENGE" if risk_score < 75 else "TERMINATE_CALL",
                    "explanation": f"Active social engineering pattern ({categories[0]}) detected.",
                }

        return {
            "recommended_challenge": "",
            "challenge_type": "NONE",
            "escalation_action": "NONE",
            "explanation": "Call characteristics within normal parameters.",
        }
