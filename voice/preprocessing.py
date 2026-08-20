"""
Voice Audio Preprocessing & Text Normalization for S40.

Handles:
1. Cleaning and normalizing transcribed text string.
2. Standardizing common Hinglish / Indian English terms.
3. Preparing text tokens for the intent classifier.
"""

import re
from typing import Dict, Any


# Standardize common Hinglish/phonetic banking scam variations
HINGLISH_MAPPINGS = {
    r"\bpaise\b": "money",
    r"\bpaisa\b": "money",
    r"\brupee\b": "rupees",
    r"\brupees\b": "rupees",
    r"\bkhata\b": "account",
    r"\bband\b": "block",
    r"\bturant\b": "immediately",
    r"\babhi\b": "now",
    r"\bjaldi\b": "hurry",
    r"\bpolice station\b": "police station",
    r"\bthana\b": "police station",
    r"\bshulka\b": "charges",
    r"\bshulk\b": "charges",
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
