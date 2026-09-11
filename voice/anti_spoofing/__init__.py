"""
AVARAN Audio Anti-Spoofing & Synthetic Voice Detection Package.

Extracts acoustic artifacts (spectral flux, pitch micro-jitter, high-frequency vocoder distortion)
to distinguish bonafide human speech from synthetic voices, voice clones, and neural TTS.
"""

from voice.anti_spoofing.acoustic_analyzer import AcousticFeatureExtractor
from voice.anti_spoofing.detector import AudioSpoofDetector

__all__ = ["AcousticFeatureExtractor", "AudioSpoofDetector"]
