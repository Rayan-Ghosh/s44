"""
Unit Tests for Video Deepfake & Visual Tampering Defense.
"""

import unittest
import numpy as np
from engine.vision.deepfake_detector import VideoDeepfakeDetector
from engine.vision.frame_analyzer import FrameTamperingAnalyzer


class TestVideoDeepfakeDefense(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.detector = VideoDeepfakeDetector(fps=30.0, threshold=0.60)
        cls.analyzer = FrameTamperingAnalyzer(target_fps=30.0)

    def test_unblinking_synthetic_avatar(self):
        """Verifies that 7 seconds with 0 blinks triggers UNNATURAL_BLINK_ABSENCE."""
        # 210 frames (7s @ 30fps) of wide open eyes (EAR = 0.35)
        static_ear = [0.35] * 210
        telemetry = {"eye_aspect_ratios": static_ear}
        res = self.detector.evaluate_video_telemetry(telemetry)
        self.assertIn("UNNATURAL_BLINK_ABSENCE", res["visual_threat_flags"])

    def test_looped_background_detection(self):
        """Verifies that repeating video clip of police room triggers LOOPED_BACKGROUND_FEED."""
        # A 2-second periodic motion cycle repeated 3 times (180 frames)
        cycle_len = 60
        cycle = np.sin(np.linspace(0, 2 * np.pi, cycle_len)).tolist()
        looped_diffs = cycle * 3
        telemetry = {"frame_difference_series": looped_diffs}
        res = self.detector.evaluate_video_telemetry(telemetry)
        self.assertIn("LOOPED_BACKGROUND_FEED", res["visual_threat_flags"])

    def test_boundary_warping_detection(self):
        """Verifies that face-swap blending seam variance triggers SYNTHETIC_FACE_BOUNDARY_WARPING."""
        # Irregular gradient spikes along perimeter
        spiked_grads = [0.1, 0.9, 0.1, 0.85, 0.15, 0.95] * 10
        telemetry = {"perimeter_gradients": spiked_grads}
        res = self.detector.evaluate_video_telemetry(telemetry)
        self.assertIn("SYNTHETIC_FACE_BOUNDARY_WARPING", res["visual_threat_flags"])

    def test_lip_sync_mismatch(self):
        """Verifies that speech energy without mouth movement triggers AUDIO_VISUAL_LIP_SYNC_MISMATCH."""
        # Audio active, mouth completely closed
        audio_eng = [0.8] * 60
        mouth_open = [0.05] * 60
        telemetry = {"audio_energy": audio_eng, "mouth_opening": mouth_open}
        res = self.detector.evaluate_video_telemetry(telemetry)
        self.assertIn("AUDIO_VISUAL_LIP_SYNC_MISMATCH", res["visual_threat_flags"])

    def test_bonafide_natural_video(self):
        """Verifies that natural video with normal blinks and smooth gradients passes safely."""
        # 180 frames with 2 natural blinks (EAR drops to 0.15 for 3 frames)
        natural_ear = [0.32] * 180
        # Blink 1 at frame 50
        natural_ear[50:53] = [0.15, 0.12, 0.16]
        # Blink 2 at frame 130
        natural_ear[130:133] = [0.14, 0.12, 0.15]

        # Natural continuous non-periodic motion
        natural_diffs = np.random.normal(0.5, 0.1, 180).tolist()
        natural_grads = [0.25] * 60

        telemetry = {
            "eye_aspect_ratios": natural_ear,
            "frame_difference_series": natural_diffs,
            "perimeter_gradients": natural_grads,
        }
        res = self.detector.evaluate_video_telemetry(telemetry)
        self.assertFalse(res["is_deepfake"])
        self.assertLess(res["video_deepfake_score"], 0.40)


if __name__ == "__main__":
    unittest.main()
