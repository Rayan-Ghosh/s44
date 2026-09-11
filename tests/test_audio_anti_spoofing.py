"""
Unit Tests and Latency Benchmarks for Audio Anti-Spoofing.
"""

import time
import unittest
import numpy as np
from voice.anti_spoofing.detector import AudioSpoofDetector
from voice.anti_spoofing.acoustic_analyzer import AcousticFeatureExtractor


class TestAudioAntiSpoofing(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.detector = AudioSpoofDetector(sample_rate=16000)
        cls.sample_rate = 16000

    def _generate_synthetic_tone(self, duration_s: float = 1.0) -> np.ndarray:
        """Simulates rigid synthetic speech: perfectly periodic with zero micro-jitter."""
        t = np.linspace(0, duration_s, int(self.sample_rate * duration_s), endpoint=False)
        # Constant 200 Hz tone + static high frequency harmonic (vocoder artifact)
        signal = 0.5 * np.sin(2 * np.pi * 200 * t) + 0.3 * np.sin(2 * np.pi * 5500 * t)
        return signal.astype(np.float32)

    def _generate_bonafide_human_voice(self, duration_s: float = 1.0) -> np.ndarray:
        """Simulates human voice: natural pitch glide with random micro-jitter and breathing."""
        n_samples = int(self.sample_rate * duration_s)
        t = np.linspace(0, duration_s, n_samples, endpoint=False)
        # Pitch drifts naturally from 140 to 180 Hz with random micro-jitter
        freq = 150.0 + 20.0 * np.sin(2 * np.pi * 1.5 * t) + np.random.normal(0, 3.0, n_samples)
        phase = 2 * np.pi * np.cumsum(freq) / self.sample_rate
        voice = 0.6 * np.sin(phase) + 0.2 * np.sin(2 * phase) + 0.1 * np.random.normal(0, 0.05, n_samples)
        return voice.astype(np.float32)

    def test_synthetic_speech_detection(self):
        """Verifies that flat, jitterless vocoder signals are flagged as synthetic."""
        synthetic = self._generate_synthetic_tone(1.0)
        res = self.detector.detect_spoof(synthetic)
        self.assertGreaterEqual(res["audio_spoof_prob"], 0.65)
        self.assertTrue(res["is_synthetic_voice"])
        self.assertIn("PITCH_MICRO_TREMOR_ABSENT", res["acoustic_evidence"])

    def test_bonafide_human_speech(self):
        """Verifies that natural voice with micro-jitter passes as non-synthetic."""
        human = self._generate_bonafide_human_voice(1.0)
        res = self.detector.detect_spoof(human)
        self.assertLess(res["audio_spoof_prob"], 0.50)
        self.assertFalse(res["is_synthetic_voice"])

    def test_short_buffer_handling(self):
        """Ensures short chunks (<250ms) do not throw errors."""
        short_buf = np.zeros(100, dtype=np.float32)
        res = self.detector.detect_spoof(short_buf)
        self.assertFalse(res["is_synthetic_voice"])

    def test_latency_performance(self):
        """Ensures processing a 1-second audio frame takes <25ms on CPU."""
        audio = self._generate_bonafide_human_voice(1.0)
        t0 = time.perf_counter()
        self.detector.detect_spoof(audio)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        print(f"\n[Acoustic Anti-Spoof Latency] 1-second buffer processed in: {latency_ms:.2f} ms")
        self.assertLess(latency_ms, 25.0)


if __name__ == "__main__":
    unittest.main()
