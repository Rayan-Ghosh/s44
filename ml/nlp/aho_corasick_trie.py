"""
Aho-Corasick Multi-String Pattern Matching Trie for AVARAN Scam NLP.

Provides linear-time O(n + m) simultaneous multi-keyword search across
multiple Indic scripts (Devanagari, Bengali, Odia) and Romanized code-switching.
Zero external ML dependencies, ultra-low latency (<10ms).
"""

import os
import json
import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Tuple, Set

logger = logging.getLogger("aho_corasick_trie")

DEFAULT_LEXICONS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "lexicons"))


@dataclass
class TrieMatch:
    """Represents a scam keyword match found in an utterance."""
    keyword: str
    start: int
    end: int
    category: str
    language: str
    weight: float
    threat_dimension: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "keyword": self.keyword,
            "start": self.start,
            "end": self.end,
            "category": self.category,
            "language": self.language,
            "weight": self.weight,
            "threat_dimension": self.threat_dimension,
        }


class _TrieNode:
    def __init__(self):
        self.children: Dict[str, _TrieNode] = {}
        self.fail: Optional[_TrieNode] = None
        self.outputs: List[Dict[str, Any]] = []


class AhoCorasickTrie:
    """
    Simultaneous multi-keyword automaton using the Aho-Corasick algorithm.
    """

    def __init__(self, lexicons_dir: Optional[str] = None):
        self.root = _TrieNode()
        self.is_built = False
        self.lexicons_dir = lexicons_dir or DEFAULT_LEXICONS_DIR
        self.categories: Set[str] = set()
        self.total_patterns: int = 0

        # Auto-load default lexicons if available
        if os.path.exists(self.lexicons_dir):
            self.load_lexicons_from_dir(self.lexicons_dir)

    def add_keyword(
        self,
        keyword: str,
        category: str,
        language: str,
        weight: float = 25.0,
        threat_dimension: str = "LEGAL_THREAT",
    ) -> None:
        """
        Inserts a keyword into the trie.
        """
        kw = keyword.strip().lower()
        if not kw:
            return

        curr = self.root
        for ch in kw:
            if ch not in curr.children:
                curr.children[ch] = _TrieNode()
            curr = curr.children[ch]

        # Prevent duplicate outputs for the same keyword and category
        if any(out["keyword"] == kw and out["category"] == category for out in curr.outputs):
            return

        curr.outputs.append({
            "keyword": kw,
            "category": category,
            "language": language,
            "weight": weight,
            "threat_dimension": threat_dimension,
            "length": len(kw),
        })
        self.categories.add(category)
        self.total_patterns += 1
        self.is_built = False

    def build_failure_links(self) -> None:
        """
        Constructs failure transitions and aggregates outputs via BFS queue.
        Must be called after adding keywords and before search.
        """
        queue = deque()

        # Depth 1: fail link points to root
        for ch, child in self.root.children.items():
            child.fail = self.root
            queue.append(child)

        # Depth >= 2
        while queue:
            curr = queue.popleft()

            for ch, child in curr.children.items():
                queue.append(child)

                # Trace fail transitions from parent
                f = curr.fail
                while f is not None and ch not in f.children:
                    f = f.fail

                if f is not None:
                    child.fail = f.children[ch]
                else:
                    child.fail = self.root

                # Merge outputs from fail node
                if child.fail:
                    child.outputs.extend(child.fail.outputs)

        self.is_built = True
        logger.debug("Aho-Corasick trie compiled with %d patterns.", self.total_patterns)

    def load_lexicons_from_dir(self, directory: str) -> None:
        """
        Loads all JSON lexicon files from the specified directory.
        """
        if not os.path.isdir(directory):
            logger.warning("Lexicons directory not found: %s", directory)
            return

        for fname in sorted(os.listdir(directory)):
            if fname.endswith(".json"):
                fpath = os.path.join(directory, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)

                    category = data.get("category", "UNKNOWN")
                    threat_dimension = data.get("threat_dimension", "LEGAL_THREAT")
                    weight = float(data.get("weight", 25.0))
                    keywords_dict = data.get("keywords", {})

                    for lang, kws in keywords_dict.items():
                        for kw in kws:
                            self.add_keyword(
                                keyword=kw,
                                category=category,
                                language=lang,
                                weight=weight,
                                threat_dimension=threat_dimension,
                            )
                except Exception as e:
                    logger.error("Failed to load lexicon file %s: %s", fname, e)

        self.build_failure_links()

    def search(self, text: str) -> List[TrieMatch]:
        """
        Searches the input text for all keyword occurrences in linear time.
        Validates Latin token boundaries to prevent spurious mid-word matches.

        Args:
            text: Lowercase transcript string to search.

        Returns:
            List of TrieMatch objects.
        """
        if not self.is_built:
            self.build_failure_links()

        if not text:
            return []

        lower_text = text.lower()
        matches: List[TrieMatch] = []
        seen_spans: Set[Tuple[str, int, int]] = set()
        curr = self.root
        n = len(lower_text)

        for i, ch in enumerate(lower_text):
            # Follow fail links until transition exists or reached root
            while curr is not None and ch not in curr.children:
                curr = curr.fail

            if curr is None:
                curr = self.root
                continue

            curr = curr.children[ch]

            # Collect outputs at current node
            for out in curr.outputs:
                kw_len = out["length"]
                start_idx = i - kw_len + 1
                end_idx = i + 1

                # Word boundary check for ASCII/Latin characters
                # Prevents e.g. "ed" matching inside "red" or "bed"
                kw = out["keyword"]
                if kw and kw[0].isascii() and kw[0].isalnum():
                    if start_idx > 0 and lower_text[start_idx - 1].isalnum():
                        continue
                if kw and kw[-1].isascii() and kw[-1].isalnum():
                    if end_idx < n and lower_text[end_idx].isalnum():
                        continue

                span_key = (out["category"], start_idx, end_idx)
                if span_key in seen_spans:
                    continue
                seen_spans.add(span_key)

                matches.append(TrieMatch(
                    keyword=out["keyword"],
                    start=start_idx,
                    end=end_idx,
                    category=out["category"],
                    language=out["language"],
                    weight=out["weight"],
                    threat_dimension=out["threat_dimension"],
                ))

        return matches
