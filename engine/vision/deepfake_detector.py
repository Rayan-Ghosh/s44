"""
Video Deepfake & Visual Tampering Detector for Real-Time Call Defense.

Evaluates facial motion, background repetition, perimeter blending, and lip-sync
to detect video avatars, deepfake face-swaps, and simulated law-enforcement video feeds.
"""

from typing import Dict, Any, List, Optional
from engine.vision.frame_analyzer import FrameTamperingAnalyzer


class VideoDeepfakeDetector:
    """
    Evaluates real-time video telemetry to detect visual deepfakes and manipulated video calls.
    """

    def __init__(self, fps: float = 30.0, threshold: float = 0.60):
        self.analyzer = FrameTamperingAnalyzer(target_fps=fps)
        self.threshold = threshold

    def evaluate_video_telemetry(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes video stream telemetry and computes deepfake risk score and threat flags.

        Args:
            telemetry: Dict containing:
                - eye_aspect_ratios: list of float values (EAR)
                - frame_difference_series: list of frame motion deltas
                - perimeter_gradients: list of face mask perimeter gradients
                - audio_energy: optional audio energy frame series
                - mouth_opening: optional mouth aspect ratio series

        Returns:
            Dict containing:
                - video_deepfake_score: float (0.0 to 1.0)
                - is_deepfake: bool
                - visual_threat_flags: list of string tags
                - metrics: dict of analysis sub-scores
        """
        if not telemetry:
            return {
                "video_deepfake_score": 0.0,
                "is_deepfake": False,
                "visual_threat_flags": [],
                "metrics": {},
            }

        flags: List[str] = []
        score_components: List[float] = []
        metrics: Dict[str, Any] = {}

        # 1. Blink Rate Analysis
        ears = telemetry.get("eye_aspect_ratios", [])
        if ears:
            blink_res = self.analyzer.analyze_blink_rate(ears)
            metrics["blink"] = blink_res
            if blink_res["is_unnatural_blink"]:
                flags.append("UNNATURAL_BLINK_ABSENCE" if blink_res["total_blinks"] == 0 else "ERRATIC_BLINK_FLUTTER")
                score_components.append(0.35)
            else:
                score_components.append(0.0)

        # 2. Background Looping / Freeze Detection
        diffs = telemetry.get("frame_difference_series", [])
        if diffs:
            loop_res = self.analyzer.analyze_background_looping(diffs)
            metrics["background_loop"] = loop_res
            if loop_res["is_looping_background"]:
                flags.append("LOOPED_BACKGROUND_FEED")
                score_components.append(0.40)
            else:
                score_components.append(0.0)

        # 3. Facial Boundary Warping / Mask Seams
        grads = telemetry.get("perimeter_gradients", [])
        if grads:
            warp_res = self.analyzer.analyze_face_boundary_warping(grads)
            metrics["boundary_warping"] = warp_res
            if warp_res["is_boundary_warped"]:
                flags.append("SYNTHETIC_FACE_BOUNDARY_WARPING")
                score_components.append(0.35)
            else:
                score_components.append(0.0)

        # 4. Lip-Audio Sync Consistency
        audio_eng = telemetry.get("audio_energy", [])
        mouth_open = telemetry.get("mouth_opening", [])
        if audio_eng and mouth_open:
            sync_res = self.analyzer.analyze_lip_sync(audio_eng, mouth_open)
            metrics["lip_sync"] = sync_res
            if sync_res["is_sync_mismatch"]:
                flags.append("AUDIO_VISUAL_LIP_SYNC_MISMATCH")
                score_components.append(0.35)
            else:
                score_components.append(0.0)

        # Combine score components
        raw_score = sum(score_components)
        video_deepfake_score = float(min(1.0, max(0.0, raw_score)))
        is_deepfake = video_deepfake_score >= self.threshold

        return {
            "video_deepfake_score": round(video_deepfake_score, 4),
            "is_deepfake": is_deepfake,
            "visual_threat_flags": flags,
            "metrics": metrics,
        }
