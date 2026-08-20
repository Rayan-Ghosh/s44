"""
Bhashini Streaming ASR Client.

Handles WebSocket connection, initial start handshake, binary PCM audio streaming,
and async reading of interim and final transcript segments.
"""

import os
import json
import time
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

import websockets

logger = logging.getLogger("bhashini_stt")


@dataclass
class TranscriptSegment:
    """Represents a speech-to-text transcript snippet received from ASR."""
    text: str
    is_final: bool
    confidence: float = 1.0
    timestamp: float = field(default_factory=time.time)
    speech_end: bool = False
    language: str = "hi"


class BhashiniStreamingClient:
    """
    Async client for streaming 16kHz audio to Bhashini STT WebSocket API
    and yielding transcript segments via an internal asyncio Queue.
    """

    DEFAULT_WS_URL = "wss://dhruva-api.bhashini.gov.in/services/inference/v2/asr/streaming"

    def __init__(
        self,
        api_key: Optional[str] = None,
        user_id: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        ws_url: Optional[str] = None,
        language: str = "hi",
        mock_mode: bool = False,
    ):
        self.api_key = api_key or os.getenv("BHASHINI_API_KEY", "")
        self.user_id = user_id or os.getenv("BHASHINI_USER_ID", "")
        self.pipeline_id = pipeline_id or os.getenv("BHASHINI_PIPELINE_ID", "")
        self.ws_url = ws_url or os.getenv("BHASHINI_WS_URL", self.DEFAULT_WS_URL)
        self.language = language
        self.mock_mode = mock_mode

        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.transcript_queue: asyncio.Queue[TranscriptSegment] = asyncio.Queue()
        self.listen_task: Optional[asyncio.Task] = None
        self.is_connected: bool = False
        self._closing: bool = False

    def build_start_payload(self) -> Dict[str, Any]:
        """Generates initial Bhashini WebSocket start control frame."""
        return {
            "event": "start",
            "language": self.language,
            "useVad": True,
            "inputEncoding": {
                "encoding": "linear16",
                "samplingRate": 16000,
                "bitsPerSample": 16,
                "numChannels": 1,
            },
            "vadConfig": {
                "pStart": 0.6,
                "pauseMs": 400,
            },
        }

    async def connect(self) -> bool:
        """Establishes WebSocket connection with Bhashini STT service and sends start frame."""
        if self.mock_mode:
            self.is_connected = True
            logger.info("BhashiniStreamingClient connected in MOCK mode.")
            return True

        headers = {}
        if self.api_key:
            headers["Authorization"] = self.api_key
        if self.user_id:
            headers["x-user-id"] = self.user_id
        if self.pipeline_id:
            headers["x-pipeline-id"] = self.pipeline_id

        try:
            logger.info(f"Connecting to Bhashini STT WS endpoint: {self.ws_url}")
            self.ws = await websockets.connect(
                self.ws_url,
                extra_headers=headers if headers else None,
                ping_interval=20,
                ping_timeout=10,
            )
            self.is_connected = True
            self._closing = False

            # Send initial start control event JSON
            start_payload = self.build_start_payload()
            await self.ws.send(json.dumps(start_payload))
            logger.info("Sent start control frame to Bhashini STT.")

            # Spawn background listener task
            self.listen_task = asyncio.create_task(self._listen_loop())
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Bhashini STT endpoint: {e}")
            self.is_connected = False
            return False

    async def send_audio_chunk(self, pcm_bytes: bytes) -> None:
        """Streams a raw binary PCM audio frame to Bhashini."""
        if self.mock_mode:
            # Mock mode: audio bytes received safely without socket errors
            return

        if not self.is_connected or not self.ws:
            logger.warning("Attempted to send audio chunk while client is disconnected.")
            return

        try:
            await self.ws.send(pcm_bytes)
        except websockets.ConnectionClosed as e:
            logger.warning(f"Bhashini WebSocket connection closed while sending audio: {e}")
            self.is_connected = False
            await self._attempt_reconnect()
        except Exception as e:
            logger.error(f"Error sending audio chunk to Bhashini: {e}")

    async def _attempt_reconnect(self) -> None:
        """Attempts background reconnection if network drops."""
        if self._closing:
            return
        logger.info("Attempting auto-reconnection to Bhashini STT...")
        for attempt in range(1, 4):
            await asyncio.sleep(1.0 * attempt)
            if await self.connect():
                logger.info("Successfully reconnected to Bhashini STT.")
                return
        logger.error("Auto-reconnection to Bhashini STT failed after 3 attempts.")

    async def _listen_loop(self) -> None:
        """Async loop consuming responses from Bhashini WebSocket."""
        while self.is_connected and self.ws and not self._closing:
            try:
                message = await self.ws.recv()
                if isinstance(message, str):
                    await self._parse_and_enqueue(message)
            except websockets.ConnectionClosed:
                logger.warning("Bhashini WebSocket connection closed in listen loop.")
                self.is_connected = False
                break
            except Exception as e:
                logger.error(f"Exception in Bhashini listen loop: {e}")
                await asyncio.sleep(0.1)

    async def _parse_and_enqueue(self, json_str: str) -> None:
        """Parses incoming JSON response from Bhashini into TranscriptSegment."""
        try:
            data = json.loads(json_str)
            text = ""
            is_final = False
            speech_end = False
            confidence = 1.0

            event_type = data.get("event", "")

            # Support diverse Bhashini response schemas
            if "pipelineResponse" in data:
                res_list = data["pipelineResponse"]
                if res_list and "output" in res_list[0]:
                    out_list = res_list[0]["output"]
                    if out_list and "source" in out_list[0]:
                        text = out_list[0]["source"]
            elif "text" in data:
                text = data.get("text", "")
            elif "transcript" in data:
                text = data.get("transcript", "")

            if "is_final" in data:
                is_final = bool(data["is_final"])
            elif event_type in ("final", "speech_end"):
                is_final = True

            if event_type == "speech_end" or data.get("speech_end"):
                speech_end = True

            confidence = float(data.get("confidence", 1.0))

            if text.strip() or speech_end:
                segment = TranscriptSegment(
                    text=text.strip(),
                    is_final=is_final,
                    confidence=confidence,
                    speech_end=speech_end,
                    language=self.language,
                )
                await self.transcript_queue.put(segment)
        except json.JSONDecodeError:
            logger.warning(f"Non-JSON string received from Bhashini: {json_str[:100]}")
        except Exception as e:
            logger.error(f"Error parsing Bhashini response: {e}")

    async def close(self) -> None:
        """Gracefully closes WebSocket connection and stops listener task."""
        self._closing = True
        self.is_connected = False

        if self.ws:
            try:
                # Send stop frame if connected
                stop_payload = {"event": "stop"}
                await self.ws.send(json.dumps(stop_payload))
                await self.ws.close()
            except Exception:
                pass
            self.ws = None

        if self.listen_task and not self.listen_task.done():
            self.listen_task.cancel()
            try:
                await self.listen_task
            except asyncio.CancelledError:
                pass
        logger.info("BhashiniStreamingClient closed cleanly.")
