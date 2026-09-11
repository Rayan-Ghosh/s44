"""
AVARAN Visual Deepfake & Video Tampering Defense Package.

Detects video call impersonation, unblinking synthetic avatars, looped video backgrounds,
and audio-visual lip sync mismatches in coercive video calls (e.g. Digital Arrest webcam extortions).
"""

from engine.vision.frame_analyzer import FrameTamperingAnalyzer
from engine.vision.deepfake_detector import VideoDeepfakeDetector

__all__ = ["FrameTamperingAnalyzer", "VideoDeepfakeDetector"]
