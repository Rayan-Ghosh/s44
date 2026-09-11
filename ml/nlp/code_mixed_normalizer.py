"""
Phonetic and Code-Mixed Normalizer for Romanized Indic Text.

Maps Hinglish, Banglish, and Odia-glish spelling variants to canonical representations
to ensure robust matching in the Aho-Corasick trie without needing heavy neural models.
"""

import re
import unicodedata
from typing import List, Set


class CodeMixedNormalizer:
    """
    Lightweight, deterministic normalizer for multilingual and code-mixed Indian transcripts.
    Handles Unicode NFKC decomposition, repeated-character collapse, and phonetic unification.
    """

    def __init__(self):
        # Regex to collapse 3 or more repeated characters: e.g. "jalddddiiii" -> "jaldi"
        self._collapse_repeats = re.compile(r"(.)\1{2,}", flags=re.IGNORECASE)
        # Whitespace cleanup
        self._multi_space = re.compile(r"\s+")

    def normalize(self, text: str) -> str:
        """
        Produces a canonicalized version of the input string.

        Args:
            text: Raw or preprocessed transcript string.

        Returns:
            Normalized lowercase string with phonetic substitutions applied.
        """
        if not text:
            return ""

        # 1. Unicode NFKC normalization (essential for Indic scripts like Devanagari/Bengali/Odia)
        normalized = unicodedata.normalize("NFKC", text)

        # 2. Lowercase and collapse elongated vowel/consonant spam
        normalized = normalized.lower()
        normalized = self._collapse_repeats.sub(r"\1\1", normalized)

        # 3. Clean spacing
        normalized = self._multi_space.sub(" ", normalized).strip()

        return normalized

    def canonicalize_roman(self, text: str) -> str:
        """
        Applies phonetic rules specifically to Romanized text (Hinglish/Banglish/Odia-glish)
        so that alternative transcriptions match cleanly.
        e.g., "bijlee" -> "bijli", "bandh" -> "band", "shontaano" -> "sontano".
        """
        t = self.normalize(text)

        # Phonetic vowel normalization
        t = re.sub(r"ee+", "i", t)
        t = re.sub(r"oo+", "u", t)
        t = re.sub(r"aa+", "a", t)

        # Common Indic romanization digraphs
        t = re.sub(r"ph", "f", t)
        t = re.sub(r"dh\b", "d", t)  # e.g., "bandh" -> "band"
        t = re.sub(r"sh", "s", t)    # e.g., "shontan" -> "sontan", "pulis" / "police"
        t = re.sub(r"kh", "k", t)    # e.g., "khatre" -> "katre"

        # Punctuation to space
        t = re.sub(r"[^\w\s\u0900-\u097F\u0980-\u09FF\u0B00-\u0B7F]", " ", t)
        t = self._multi_space.sub(" ", t).strip()
        return t

    def get_search_variants(self, text: str) -> List[str]:
        """
        Returns a list of search strings: the base NFKC text and the phonetically canonicalized text.
        """
        base = self.normalize(text)
        canonical = self.canonicalize_roman(text)
        if base == canonical:
            return [base]
        return [base, canonical]
