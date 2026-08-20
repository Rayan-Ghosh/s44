"""
Session Manager and Call Session Coordinator.

Manages active streaming call sessions, coordinates audio forwarding to Bhashini STT,
buffers transcript segments in a rolling window, and pipes transcripts through
the FraudRiskEngine to emit real-time WebSocket alerts.
"""

import time
import asyncio
import logging
from typing import Dict, List, Any, Optional

from fastapi import WebSocket
from services.bhashini_stt import BhashiniStreamingClient, TranscriptSegment
from engine.fraud_detector import FraudRiskEngine, RiskState, FraudAlertPayload

logger = logging.getLogger("session_manager")


class CallSession:
    """
    Manages an active call streaming session.
    Pairs client WebSocket with BhashiniStreamingClient and FraudRiskEngine.
    """

    def __init__(self, session_id: str, websocket: WebSocket, mock_mode: bool = False):
        self.session_id = session_id
        self.websocket = websocket
        self.mock_mode = mock_mode

        self.bhashini_client = BhashiniStreamingClient(mock_mode=mock_mode)
        self.fraud_engine = FraudRiskEngine(gamma=0.85, window_seconds=60.0)
        self.transcript_buffer: List[Dict[str, Any]] = []

        self.processor_task: Optional[asyncio.Task] = None
        self.is_active: bool = False

    async def start(self) -> None:
        """Starts Bhashini client and spawns background transcript processor."""
        self.is_active = True
        await self.bhashini_client.connect()
        self.processor_task = asyncio.create_task(self._process_transcripts())
        logger.info(f"Session {self.session_id} started.")

    async def process_audio_chunk(self, pcm_bytes: bytes) -> None:
        """Forwards raw 16kHz binary PCM audio chunk to Bhashini ASR client."""
        if not self.is_active:
            return
        await self.bhashini_client.send_audio_chunk(pcm_bytes)

    async def inject_transcript_mock(self, text: str, is_final: bool = True) -> None:
        """Helper for mock testing: directly enqueues transcript segments into queue."""
        segment = TranscriptSegment(text=text, is_final=is_final)
        await self.bhashini_client.transcript_queue.put(segment)

    async def _process_transcripts(self) -> None:
        """Background task reading transcripts from queue and scoring with FraudRiskEngine."""
        while self.is_active:
            try:
                # Wait for segment from queue with 0.5s timeout for periodic checks
                try:
                    segment = await asyncio.wait_for(
                        self.bhashini_client.transcript_queue.get(), timeout=0.5
                    )
                except asyncio.TimeoutError:
                    continue

                if not segment or not segment.text:
                    continue

                # Buffer transcript with timestamp
                now = time.time()
                self.transcript_buffer.append({"text": segment.text, "timestamp": now})
                self._prune_transcript_buffer(now)

                # Process text with FraudRiskEngine
                state, score, alert = self.fraud_engine.process_utterance(
                    segment.text, session_id=self.session_id
                )

                # 1. Send Transcript & Risk Status update to caller
                status_payload = {
                    "event": "TRANSCRIPT_UPDATE",
                    "session_id": self.session_id,
                    "text": segment.text,
                    "is_final": segment.is_final,
                    "risk_score": score,
                    "state": state.value,
                }
                try:
                    await self.websocket.send_json(status_payload)
                except Exception as e:
                    logger.warning(f"Failed to send status update over WebSocket for {self.session_id}: {e}")

                # 2. Dispatch FRAUD_ALERT if threshold reached
                if alert:
                    try:
                        await self.websocket.send_json(alert.to_dict())
                        logger.warning(f"Sent FRAUD_ALERT to client for session {self.session_id}")
                    except Exception as e:
                        logger.error(f"Failed to send FRAUD_ALERT over WebSocket for {self.session_id}: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error processing transcripts in session {self.session_id}: {e}")
                await asyncio.sleep(0.1)

    def _prune_transcript_buffer(self, now: float) -> None:
        """Prunes buffer to keep only last 60 seconds of text."""
        cutoff = now - 60.0
        self.transcript_buffer = [
            item for item in self.transcript_buffer if item["timestamp"] >= cutoff
        ]

    def get_rolling_transcript(self) -> str:
        """Returns concatenated text from the last 60 seconds."""
        return " ".join([item["text"] for item in self.transcript_buffer])

    async def stop(self) -> None:
        """Stops background processor and closes Bhashini connection cleanly."""
        self.is_active = False
        if self.processor_task and not self.processor_task.done():
            self.processor_task.cancel()
            try:
                await self.processor_task
            except asyncio.CancelledError:
                pass
        await self.bhashini_client.close()
        logger.info(f"Session {self.session_id} stopped cleanly.")


class SessionManager:
    """Singleton session coordinator managing active call sessions."""

    def __init__(self):
        self.active_sessions: Dict[str, CallSession] = {}

    async def create_session(
        self, session_id: str, websocket: WebSocket, mock_mode: bool = False
    ) -> CallSession:
        """Creates, initializes, and stores a new call session."""
        if session_id in self.active_sessions:
            logger.info(f"Re-initializing session {session_id}")
            await self.remove_session(session_id)

        session = CallSession(session_id=session_id, websocket=websocket, mock_mode=mock_mode)
        await session.start()
        self.active_sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[CallSession]:
        """Retrieves active call session by ID."""
        return self.active_sessions.get(session_id)

    async def remove_session(self, session_id: str) -> None:
        """Tears down and removes an active call session."""
        session = self.active_sessions.pop(session_id, None)
        if session:
            await session.stop()
            logger.info(f"Removed session {session_id}")


# Global SessionManager instance
session_manager = SessionManager()
