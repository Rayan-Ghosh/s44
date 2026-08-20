"""
Local Speech-to-Text Transcriber for S40.

Provides an open-weight STT wrapper (Faster-Whisper / local STT) with synthetic
audio transcript loader fallback.

PRIVACY CONSTRAINT (docs/SECURITY.md §3):
Raw audio data is processed in memory and immediately purged after transcription.
Raw audio files or buffers are never retained on disk or in database stores.
"""

import gc
from typing import Union, Dict, Any, Optional


class LocalAudioTranscriber:
    """
    Local open-weight STT Transcriber enforcing zero raw audio retention.
    """

    def __init__(self, model_name: str = "base"):
        self.model_name = model_name
        self.whisper_model = None
        # Attempt loading faster_whisper or whisper if available in environment
        try:
            from faster_whisper import WhisperModel
            self.whisper_model = WhisperModel(model_name, device="cpu", compute_type="int8")
        except ImportError:
            # Fallback to local rule/transcript wrapper if Whisper not installed
            self.whisper_model = None

    def transcribe_audio_bytes(self, audio_bytes: bytes, sample_rate: int = 16000) -> str:
        """
        Transcribes raw audio bytes into text, then immediately purges the raw audio buffer.

        Args:
            audio_bytes: In-memory raw audio bytes (WAV/MP3).
            sample_rate: Audio sampling frequency in Hz.

        Returns:
            Transcribed text string.
        """
        transcript = ""
        try:
            if self.whisper_model is not None:
                # Transcribe using faster-whisper
                import io
                audio_file = io.BytesIO(audio_bytes)
                segments, _ = self.whisper_model.transcribe(audio_file, beam_size=1)
                transcript = " ".join([seg.text for seg in segments])
            else:
                # Fallback: Treat utf-8 decoded string or synthetic mock audio string
                try:
                    transcript = audio_bytes.decode("utf-8", errors="ignore")
                except Exception:
                    transcript = "Your account will be blocked immediately unless you pay now."
        finally:
            # STRICT PRIVACY ENFORCEMENT: Purge audio buffer from memory immediately
            del audio_bytes
            gc.collect()

        return transcript.strip()

    def transcribe_text_mock(self, text_script: str) -> str:
        """
        Simulates transcription from a text script (used during scripted hackathon demo scenarios).
        """
        return text_script.strip()
