"""
Audio Anti-Spoofing & Synthetic Speech Detector.

Integrates acoustic feature extraction into a real-time risk classifier
that detects cloned, vocoded, and neural TTS voices.
"""

from typing import Dict, Any, List, Optional, Union
import numpy as np
from voice.anti_spoofing.acoustic_analyzer import AcousticFeatureExtractor


class AudioSpoofDetector:
    """
    Evaluates real-time audio buffers to detect synthetic speech / voice deepfakes.
    Produces calibrated spoof probabilities and explainable acoustic evidence tags.
    """

    def __init__(self, sample_rate: int = 16000, threshold: float = 0.65):
        self.extractor = AcousticFeatureExtractor(sample_rate=sample_rate)
        self.threshold = threshold

    def detect_spoof(self, audio_data: Union[bytes, np.ndarray]) -> Dict[str, Any]:
        """
        Analyzes audio buffer and returns spoof probability and acoustic evidence.

        Args:
            audio_data: Either raw 16kHz 16-bit PCM bytes or float32 audio array.

        Returns:
            Dict containing:
                - audio_spoof_prob: float (0.0 to 1.0)
                - is_synthetic_voice: bool
                - acoustic_evidence: list of detected anomalies
                - features: dict of raw acoustic metrics
        """
        if isinstance(audio_data, bytes):
            audio = self.extractor.pcm_to_float(audio_data)
        else:
            audio = audio_data

        if len(audio) < self.extractor.sample_rate * 0.25:
            # Buffer too short (<250ms), return neutral baseline
            return {
                "audio_spoof_prob": 0.05,
                "is_synthetic_voice": False,
                "acoustic_evidence": [],
                "features": {},
            }

        feats = self.extractor.extract_features(audio)
        evidence: List[str] = []
        score_components = []

        # 1. Pitch Jitter Analysis: Synthetic TTS lacks natural involuntary micro-jitter
        jitter = feats["jitter"]
        if jitter < 0.006:
            evidence.append("PITCH_MICRO_TREMOR_ABSENT")
            score_components.append(0.35)
        elif jitter < 0.012:
            score_components.append(0.15)
        else:
            score_components.append(0.0)

        # 2. Fundamental Frequency Range / Monotone Flatness
        f0_std = feats["f0_std"]
        if f0_std < 2.5:
            evidence.append("SYNTHETIC_PITCH_FLATNESS")
            score_components.append(0.35)
        elif f0_std < 6.0:
            score_components.append(0.15)
        else:
            score_components.append(0.0)

        # 3. Vocoder High-Frequency Energy Artifacts (>4kHz band distortion)
        hf_ratio = feats["hf_ratio"]
        if hf_ratio > 0.45:
            evidence.append("VOCODER_HIGH_FREQUENCY_DISTORTION")
            score_components.append(0.30)
        elif hf_ratio > 0.30:
            score_components.append(0.15)
        else:
            score_components.append(0.0)

        # 4. Spectral Centroid Rigidity
        centroid_std = feats["centroid_std"]
        if centroid_std < 150.0 and len(audio) > self.extractor.sample_rate * 0.8:
            evidence.append("VOCAL_TRACT_SPECTRAL_RIGIDITY")
            score_components.append(0.20)
        else:
            score_components.append(0.0)

        # Calculate combined acoustic spoof probability
        # Bounded in [0.0, 1.0]
        raw_prob = sum(score_components)
        # Cap and smooth
        audio_spoof_prob = float(min(1.0, max(0.02, raw_prob)))
        is_synthetic = audio_spoof_prob >= self.threshold

        return {
            "audio_spoof_prob": round(audio_spoof_prob, 4),
            "is_synthetic_voice": is_synthetic,
            "acoustic_evidence": evidence,
            "features": feats,
        }
