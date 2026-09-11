"""
/ws/voice-stream — Real-time WebSocket for live speech transcription and coercion defense.
"""

import json
from typing import Dict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from voice.classifier import VoiceClassifier
from voice.leaky_bucket import LeakyBucketAccumulator

router = APIRouter(tags=["voice"])

# Session memory for active call streams
sessions: Dict[str, Dict] = {}


@router.websocket("/ws/voice-stream")
async def voice_stream_endpoint(websocket: WebSocket):
    await websocket.accept()
    session_id = f"session_{id(websocket)}"
    classifier = VoiceClassifier()
    accumulator = LeakyBucketAccumulator(capacity=1.0, leak_rate=0.02)
    sessions[session_id] = {"classifier": classifier, "accumulator": accumulator}

    try:
        while True:
            data = await websocket.receive_text()
            try:
                packet = json.loads(data)
                text = packet.get("text_chunk", "")
            except Exception:
                text = data

            if not text or not text.strip():
                continue

            # Classify chunk
            result = classifier.classify_transcript(text)
            chunk_risk = float(result.get("overall_voice_risk", 0.0))
            matched = result.get("matched_phrases", [])
            intents = result.get("active_threat_dimensions", [])

            # Accumulate in leaky bucket
            accumulated = accumulator.add_risk(chunk_risk)

            # Determine coercion status
            if accumulated >= 0.70:
                coercion_level = "CRITICAL"
                is_scam = True
                msg = "CRITICAL SOCIAL ENGINEERING SCAM DETECTED! High pressure coercive scam call in progress."
            elif accumulated >= 0.35:
                coercion_level = "ELEVATED"
                is_scam = False
                msg = "Elevated caution: scam keywords detected."
            else:
                coercion_level = "SAFE"
                is_scam = False
                msg = "Normal speech pattern."

            response = {
                "accumulated_risk": round(accumulated, 3),
                "coercion_level": coercion_level,
                "detected_intents": intents,
                "matched_phrases": matched,
                "scam_categories": result.get("scam_categories", []),
                "columbo_trap_prompt": result.get("columbo_trap_prompt") if coercion_level in ("ELEVATED", "CRITICAL") else None,
                "is_scam_alert": is_scam,
                "message": msg,
            }

            await websocket.send_text(json.dumps(response))

    except WebSocketDisconnect:
        sessions.pop(session_id, None)
    except Exception as e:
        sessions.pop(session_id, None)
