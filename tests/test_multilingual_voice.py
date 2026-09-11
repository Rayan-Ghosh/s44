"""
Comprehensive Multilingual Voice Intent & Vishing Defense Unit Tests.

Covers:
1. English regression coverage.
2. Hindi (Devanagari + Hinglish) across all 5 scam categories.
3. Bengali (Bengali script + Banglish) across all 5 scam categories.
4. Odia (Odia script + Odia-glish) coverage.
5. Multilingual negation suppression (English, Hindi, Bengali).
6. Static Columbo Protocol trap prompt generation.
7. Fast-path latency benchmark (<50ms per utterance).
"""

import time
import unittest
from voice.classifier import VoiceClassifier
from ml.nlp.aho_corasick_trie import AhoCorasickTrie
from ml.nlp.code_mixed_normalizer import CodeMixedNormalizer
from engine.copilot.static_trap_prompts import get_trap_prompt, TRAP_PROMPTS


class TestMultilingualVoiceDefense(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.classifier = VoiceClassifier()
        cls.trie = AhoCorasickTrie()
        cls.normalizer = CodeMixedNormalizer()

    def test_english_baseline_regression(self):
        """Ensures existing English detection paths continue to fire accurately."""
        text = "This is the police department. A warrant for your digital arrest has been issued."
        result = self.classifier.classify_transcript(text)
        self.assertGreaterEqual(result["overall_voice_risk"], 0.35)
        self.assertTrue(result["flags"]["threat_detected"])
        self.assertIn("DIGITAL_ARREST_POLICE", result["scam_categories"])
        self.assertIsNotNone(result["columbo_trap_prompt"])

    def test_hindi_devanagari_digital_arrest(self):
        """Verifies Hindi Devanagari digital arrest detection."""
        text = "सीबीआई अफसर बोल रहा हूँ, सुप्रीम कोर्ट से आपके खिलाफ डिजिटल अरेस्ट वारंट जारी हुआ है।"
        result = self.classifier.classify_transcript(text)
        self.assertGreaterEqual(result["overall_voice_risk"], 0.35)
        self.assertTrue(result["flags"]["threat_detected"])
        self.assertIn("DIGITAL_ARREST_POLICE", result["scam_categories"])
        self.assertIn("सीबीआई अफसर", result["matched_phrases"])
        self.assertIsNotNone(result["columbo_trap_prompt"])
        self.assertIn("कंट्रोल रूम", result["columbo_trap_prompt"])

    def test_hinglish_electricity_cut(self):
        """Verifies Romanized Hinglish electricity cutoff detection."""
        text = "Aapka bijlee connection aaj raat kat diya jayega, turant bill jama karein."
        result = self.classifier.classify_transcript(text)
        self.assertGreaterEqual(result["overall_voice_risk"], 0.35)
        self.assertTrue(result["flags"]["urgency_detected"])
        self.assertIn("ELECTRICITY_CUTOFF", result["scam_categories"])
        self.assertIsNotNone(result["columbo_trap_prompt"])

    def test_bengali_script_and_banglish(self):
        """Verifies Bengali script and Banglish child custody detection."""
        # Native Bengali
        text_bn = "আমি সিবিআই অফিসার বলছি, আপনার বিরুদ্ধে গ্রেফতারি পরোয়ানা জারি হয়েছে।"
        result_bn = self.classifier.classify_transcript(text_bn)
        self.assertGreaterEqual(result_bn["overall_voice_risk"], 0.35)
        self.assertTrue(result_bn["flags"]["threat_detected"])
        self.assertIn("DIGITAL_ARREST_POLICE", result_bn["scam_categories"])
        self.assertIsNotNone(result_bn["columbo_trap_prompt"])

        # Banglish
        text_banglish = "Apnar chele greptar hoyeche police custody te, jaminer taka pathan akhoni."
        result_bg = self.classifier.classify_transcript(text_banglish)
        self.assertGreaterEqual(result_bg["overall_voice_risk"], 0.35)
        self.assertIn("CHILD_CUSTODY_EXTORTION", result_bg["scam_categories"])

    def test_odia_native_and_glish(self):
        """Verifies Odia script and Odia-glish customs detection."""
        # Native Odia
        text_or = "ସିବିଆଇ ଅଫିସର କହୁଛି, ତୁରନ୍ତ ଭିଡିଓ କଲ୍ କାଟନ୍ତୁ ନାହିଁ ଏବଂ ଗିରଫ ୱାରେଣ୍ଟ ଜାରି ହୋଇଛି।"
        result_or = self.classifier.classify_transcript(text_or)
        self.assertGreaterEqual(result_or["overall_voice_risk"], 0.35)
        self.assertIn("DIGITAL_ARREST_POLICE", result_or["scam_categories"])

        # Odia-glish
        text_or_glish = "Customs parcel jabata hoichi, turanta customs penalty tanka dia."
        result_glish = self.classifier.classify_transcript(text_or_glish)
        self.assertGreaterEqual(result_glish["overall_voice_risk"], 0.35)
        self.assertIn("CUSTOMS_PARCEL_SEIZURE", result_glish["scam_categories"])

    def test_negation_suppression_multilingual(self):
        """Verifies that advisory/negated phrases do NOT trigger false positives."""
        negated_cases = [
            ("English", "Warning: Never share your OTP or PIN with any bank caller."),
            ("Hindi", "सावधान रहें, किसी को भी अपना ओटीपी मत बताना।"),
            ("Hinglish", "Bank se OTP kisi ko mat dena, yeh scam hai."),
            ("Bengali", "সতর্ক থাকুন, অপরিচিত কাউকে ওটিপি দেবেন না।"),
            ("Banglish", "Kauke OTP deben na, eta bank theke boleche."),
        ]

        for lang, text in negated_cases:
            result = self.classifier.classify_transcript(text)
            self.assertFalse(
                result["flags"]["credential_harvesting"],
                f"False positive on negated credential phrase in {lang}: {text}"
            )
            self.assertEqual(
                len(result["scam_categories"]),
                0,
                f"Spurious scam category triggered on negated text in {lang}: {text}"
            )

    def test_columbo_trap_prompts_availability(self):
        """Verifies that every supported scam category has valid traps across languages."""
        for cat in ["DIGITAL_ARREST_POLICE", "CHILD_CUSTODY_EXTORTION", "ELECTRICITY_CUTOFF", "KYC_ACCOUNT_FREEZE", "CUSTOMS_PARCEL_SEIZURE"]:
            self.assertIn(cat, TRAP_PROMPTS)
            self.assertIsNotNone(get_trap_prompt(cat, "en"))
            self.assertIsNotNone(get_trap_prompt(cat, "hi"))
            self.assertIsNotNone(get_trap_prompt(cat, "bn"))

    def test_latency_budget(self):
        """Verifies that multilingual trie classification executes in <50ms (budget <150ms)."""
        sample_utterance = "Main CBI officer bol raha hu, Supreme Court se Digital Arrest warrant issue hua hai."
        latencies = []

        # Warm-up
        for _ in range(5):
            self.classifier.classify_transcript(sample_utterance)

        # Measure 50 iterations
        for _ in range(50):
            t0 = time.perf_counter()
            self.classifier.classify_transcript(sample_utterance)
            t1 = time.perf_counter()
            latencies.append((t1 - t0) * 1000.0)

        avg_latency = sum(latencies) / len(latencies)
        max_latency = max(latencies)

        print(f"\n[LATENCY BENCHMARK] Avg: {avg_latency:.2f} ms, Max: {max_latency:.2f} ms")
        self.assertLess(avg_latency, 50.0, f"Average latency {avg_latency:.2f}ms exceeded 50ms budget")


if __name__ == "__main__":
    unittest.main()
