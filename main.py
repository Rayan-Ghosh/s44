"""
FastAPI Server for Real-Time Call Fraud Detection.

Provides WebSocket endpoint `/ws/call-stream/{session_id}` for streaming 16kHz PCM audio
from active calls, performing streaming ASR via Bhashini, and evaluating fraud risk.
"""

import json
import logging
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import JSONResponse

from session_manager import session_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("main")

app = FastAPI(
    title="Real-Time Call Fraud Detection API (Bhashini ASR)",
    description="Asynchronous pipeline for real-time speech fraud detection using Bhashini STT.",
    version="1.0.0",
)


@app.get("/health")
async def health_check():
    """Health check endpoint returning active session count."""
    active_count = len(session_manager.active_sessions)
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "active_sessions": active_count,
            "pipeline": "Bhashini Streaming ASR + Stateful Leaky Bucket Fraud Detector",
        },
    )


@app.websocket("/ws/call-stream/{session_id}")
async def call_stream_endpoint(
    websocket: WebSocket,
    session_id: str,
    mock: Optional[bool] = Query(default=False),
):
    """
    WebSocket endpoint for live 16kHz PCM call audio streaming.

    Receives binary audio frames from active call clients, forwards them to Bhashini STT,
    runs the Stateful Fraud Detector, and pushes real-time FRAUD_ALERT payloads if triggered.
    """
    await websocket.accept()
    logger.info(f"WebSocket client connected for session_id: {session_id} (mock={mock})")

    # Initialize session coordinator
    session = await session_manager.create_session(
        session_id=session_id, websocket=websocket, mock_mode=mock
    )

    try:
        while True:
            # Receive message from WebSocket client (bytes or text/json)
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                pcm_data: bytes = message["bytes"]
                await session.process_audio_chunk(pcm_data)

            elif "text" in message and message["text"]:
                text_msg: str = message["text"]
                try:
                    payload = json.loads(text_msg)
                    event_type = payload.get("event", "")

                    if event_type == "inject_mock":
                        # Support direct transcript injection for testing scenarios
                        mock_text = payload.get("text", "")
                        is_final = payload.get("is_final", True)
                        await session.inject_transcript_mock(mock_text, is_final=is_final)

                    elif event_type == "ping":
                        await websocket.send_json({"event": "pong", "session_id": session_id})

                    elif event_type == "stop":
                        logger.info(f"Received stop command for session: {session_id}")
                        break
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON text received on session {session_id}: {text_msg[:100]}")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session_id: {session_id}")
    except Exception as e:
        logger.error(f"Unexpected error in WebSocket endpoint for session {session_id}: {e}")
    finally:
        await session_manager.remove_session(session_id)
        logger.info(f"Cleaned up session_id: {session_id}")
