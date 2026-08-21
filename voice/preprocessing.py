"""
Voice Audio Preprocessing & Text Normalization for S40.

Handles:
1. Cleaning and normalizing transcribed text string.
2. Standardizing common Hinglish / Indian English terms.
3. Preparing text tokens for the intent classifier.
"""

import re
from typing import Dict, Any


# Masterclass Encyclopedic Multi-Dialect & Phonetic Lexicon for Indian Cyber-Fraud Detection
# Covers Hindi, Hinglish, Bengali, Marathi, Tamil, Telugu, Kannada, Gujarati, Punjabi, and Bhojpuri
HINGLISH_MAPPINGS = {

    # ---------------------------------------------------------
    # 1. CURRENCY, MONEY & FINANCIAL EXTRACTION (Multi-Dialect)
    # ---------------------------------------------------------
    r"\bpaise\b": "money",
    r"\bpaisa\b": "money",
    r"\brupee\b": "rupees",
    r"\brupees\b": "rupees",
    r"\brupaiya\b": "rupees",
    r"\brupaye\b": "rupees",
    r"\brokda\b": "cash money",
    r"\brokad\b": "cash money",
    r"\btaka\b": "money",
    r"\bpoisha\b": "money",
    r"\bdhan\b": "money",
    r"\brashi\b": "financial amount",
    r"\brakkham\b": "financial amount",
    r"\brakkam\b": "financial amount",
    r"\bdabbu\b": "money",
    r"\bpanam\b": "money",
    r"\bkaasu\b": "money",
    r"\bhana\b": "money",
    r"\bshulk\b": "fee charges",
    r"\bshulka\b": "fee charges",
    r"\bjurmana\b": "penalty fine",
    r"\bjurmane\b": "penalty fine",
    r"\bdand\b": "penalty fine",
    r"\bchalan\b": "penalty fine",
    r"\bchallan\b": "penalty fine",
    r"\bhisaab\b": "account settlement",
    r"\bvasuli\b": "recovery demand",
    r"\bsuraksha deposit\b": "security deposit",
    r"\bdharohar rashi\b": "security deposit",
    r"\bclearance fund\b": "clearance fund",
    r"\bescrow deposit\b": "escrow deposit",
    r"\bverification fee\b": "verification fee",

    # ---------------------------------------------------------
    # 2. BANKING, ACCOUNT & REGISTRATION
    # ---------------------------------------------------------
    r"\bkhata\b": "bank account",
    r"\bkhaate\b": "bank account",
    r"\bkhate\b": "bank account",
    r"\bshakha\b": "bank branch",
    r"\bshaka\b": "bank branch",
    r"\bprabandhak\b": "bank manager",
    r"\bbachat\b": "savings",
    r"\btheva\b": "deposit",
    r"\bbank khata\b": "bank account",
    r"\bbank khaata\b": "bank account",
    r"\bsewa\b": "service",
    r"\bpanjiyaran\b": "registration",
    r"\bpramanikaran\b": "authentication verification",
    r"\bunfreeze\b": "unblock account",
    r"\brelease fund\b": "release money",

    # ---------------------------------------------------------
    # 3. POLICE, INTELLIGENCE, COURTS & LEGAL THREATS
    # ---------------------------------------------------------
    r"\bthana\b": "police station",
    r"\bthane\b": "police station",
    r"\bkotwali\b": "police station",
    r"\bchowki\b": "police post",
    r"\bdaroga\b": "police inspector",
    r"\bhawaldar\b": "police constable",
    r"\bthanedaar\b": "police station incharge",
    r"\bgiraftari\b": "police arrest",
    r"\bgiraftar\b": "police arrest",
    r"\bhatkadi\b": "handcuffs arrest",
    r"\bkarawas\b": "prison jail",
    r"\bjail\b": "prison jail",
    r"\bbandigriha\b": "prison jail",
    r"\bkustody\b": "police custody",
    r"\badalat\b": "court of law",
    r"\bnyayalaya\b": "court of law",
    r"\bkanoon\b": "law",
    r"\bkanooni\b": "legal",
    r"\bkaryawahi\b": "legal action",
    r"\bkarwayi\b": "legal action",
    r"\bkanooni notice\b": "court legal notice",
    r"\bdigital arrest\b": "digital arrest warrant",
    r"\bwarrant\b": "arrest warrant",
    r"\bnon bailable\b": "non bailable warrant",
    r"\bgair zamanati\b": "non bailable warrant",
    r"\bchhapamari\b": "police raid",
    r"\btalashi\b": "police search",
    r"\baprath\b": "criminal crime",
    r"\bapradh\b": "criminal crime",
    r"\bgunaah\b": "criminal crime",
    r"\bdoshi\b": "guilty criminal",
    r"\bdrohi\b": "guilty criminal",
    r"\bmoney laundering\b": "money laundering crime",
    r"\bhawala\b": "illegal money laundering",
    r"\bnarcotics\b": "illegal narcotics drugs",
    r"\bcharas\b": "illegal narcotics contraband",
    r"\bganja\b": "illegal narcotics contraband",
    r"\billegal parcel\b": "illegal contraband courier",
    r"\bcontraband\b": "illegal contraband",
    r"\bdeshdroh\b": "anti national crime",

    # ---------------------------------------------------------
    # 4. LAW ENFORCEMENT & REGULATORY AUTHORITIES
    # ---------------------------------------------------------
    r"\bcbi\b": "central bureau of investigation",
    r"\bed officer\b": "enforcement directorate officer",
    r"\benforcement directorate\b": "enforcement directorate",
    r"\bncb\b": "narcotics control bureau",
    r"\bnia\b": "national investigation agency",
    r"\bcyber cell\b": "cyber crime police department",
    r"\bcrime branch\b": "crime branch police",
    r"\bcyber thana\b": "cyber crime police station",
    r"\brbi\b": "reserve bank of india",
    r"\brbi governor\b": "reserve bank authority",
    r"\bincome tax department\b": "income tax authority",
    r"\bcustoms department\b": "customs border authority",
    r"\btrai\b": "telecom regulatory authority",
    r"\bdoorsanchar vibhag\b": "telecom regulatory department",
    r"\bbijli vibhag\b": "electricity board authority",
    r"\bbidyut board\b": "electricity board authority",

    # ---------------------------------------------------------
    # 5. URGENCY, COERCION & DEADLINES (Multi-Dialect)
    # ---------------------------------------------------------
    r"\bturant\b": "immediately",
    r"\bturanto\b": "immediately",
    r"\babhi\b": "now",
    r"\babhi ke abhi\b": "right now immediately",
    r"\bjaldi\b": "hurry immediately",
    r"\bphataphat\b": "urgently quickly",
    r"\bsheeghra\b": "urgently immediately",
    r"\btatkal\b": "immediate urgent",
    r"\bavashyak\b": "critical urgent",
    r"\bzaruri\b": "critical urgent",
    r"\bjaruri\b": "critical urgent",
    r"\bdeir mat karo\b": "do not delay immediately",
    r"\bder mat karo\b": "do not delay immediately",
    r"\bbina deri ke\b": "without delay immediately",
    r"\bantim avsar\b": "final last warning notice",
    r"\bantim chetavani\b": "final last warning notice",
    r"\blast chance\b": "final deadline warning",
    r"\b5 minute\b": "5 minutes urgent deadline",
    r"\b10 minute\b": "10 minutes urgent deadline",
    r"\baaj raat tak\b": "tonight deadline",

    # ---------------------------------------------------------
    # 6. PSYCHOLOGICAL ISOLATION & SECRECY
    # ---------------------------------------------------------
    r"\bkisi ko mat batana\b": "do not inform anyone",
    r"\bkisi se baat mat karo\b": "do not talk to anyone",
    r"\bghar walo ko mat batana\b": "do not inform family",
    r"\bparivar ko mat batao\b": "do not inform family",
    r"\bdost ko mat batana\b": "do not inform friends",
    r"\bkamre me akele jao\b": "go into isolated room alone",
    r"\bkundi laga lo\b": "lock the room door alone",
    r"\bdarwaza band karo\b": "close door alone",
    r"\bphone mat katna\b": "do not disconnect call",
    r"\bphone mat kaatna\b": "do not disconnect call",
    r"\bcall disconnect mat karna\b": "do not disconnect call",
    r"\bline pe raho\b": "stay on the live line",
    r"\bline par bane rahiye\b": "stay on the live line",
    r"\bgopniya\b": "confidential secret investigation",
    r"\brahasya\b": "confidential secret",
    r"\bofficial secret\b": "confidential national secret",

    # ---------------------------------------------------------
    # 7. UTILITIES & TELECOM DISCONNECTION THREATS
    # ---------------------------------------------------------
    r"\bbijli\b": "electricity supply",
    r"\bbidyut\b": "electricity supply",
    r"\bbatti\b": "electricity supply",
    r"\bcurrent\b": "electricity supply",
    r"\bkatuti\b": "power disconnection",
    r"\bkat jayega\b": "will be disconnected",
    r"\bkaat diya jayega\b": "will be disconnected",
    r"\bline cut\b": "power disconnection",
    r"\bsim card band\b": "sim card deactivation",
    r"\bmobile block\b": "phone deactivation",
    r"\bkyc update\b": "mandatory kyc suspension",
    r"\blpg cylinder block\b": "gas connection suspension",

    # ---------------------------------------------------------
    # 8. REMOTE CONTROL APKS & MALWARE TOOLS
    # ---------------------------------------------------------
    r"\benydesk\b": "anydesk remote screen control",
    r"\banidesk\b": "anydesk remote screen control",
    r"\banydesk\b": "anydesk remote screen control",
    r"\btimviewer\b": "teamviewer remote screen control",
    r"\bteamviewer\b": "teamviewer remote screen control",
    r"\brustdesk\b": "rustdesk remote screen control",
    r"\bquicksupport\b": "quicksupport remote access",
    r"\bzoho assist\b": "zoho assist remote control",
    r"\bscreen share\b": "remote screen mirror share",
    r"\bscreen mirror\b": "remote screen mirror share",
    r"\bapp download\b": "malicious application download",
    r"\bapk download\b": "malicious apk installation",
    r"\bcode share karo\b": "share 9 digit access code",
    r"\baddress code\b": "remote access address code",
    r"\ballow permission\b": "grant accessibility permission",
}




class AudioPreprocessor:
    """
    Normalizes text transcripts extracted from speech audio.
    """

    def normalize_transcript(self, raw_transcript: str) -> str:
        """
        Cleans raw audio transcript text, strips special characters,
        maps Hinglish terms to standardized English terms.

        Args:
            raw_transcript: Raw string output from speech-to-text.

        Returns:
            Normalized, clean transcript string.
        """
        if not raw_transcript:
            return ""

        # Lowercase and replace punctuation with spaces
        text = raw_transcript.lower().strip()
        text = re.sub(r"[^\w\s]", " ", text)
        text = re.sub(r"\s+", " ", text)

        # Apply Hinglish mappings
        for pattern, replacement in HINGLISH_MAPPINGS.items():
            text = re.sub(pattern, replacement, text)

        return text.strip()
