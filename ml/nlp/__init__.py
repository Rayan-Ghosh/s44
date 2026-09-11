"""
AVARAN Multilingual Scam-Call NLP Package.
Provides multi-string Aho-Corasick trie matching, phonetic code-mixed normalization,
and multilingual scam intent lexicons (Hindi, Bengali, Odia, English).
"""

from ml.nlp.aho_corasick_trie import AhoCorasickTrie
from ml.nlp.code_mixed_normalizer import CodeMixedNormalizer

__all__ = ["AhoCorasickTrie", "CodeMixedNormalizer"]
