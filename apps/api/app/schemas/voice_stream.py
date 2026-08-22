"""Pydantic schemas for Real-Time Voice WebSocket Stream."""

from typing import Optional
from pydantic import BaseModel


class VoiceStreamPacket(BaseModel):
    text_chunk: Optional[str] = None
    audio_base64: Optional[str] = None
    session_id: Optional[str] = "default"


class VoiceStreamResponse(BaseModel):
    accumulated_risk: float
    coercion_level: str  # SAFE, ELEVATED, CRITICAL
    detected_intents: list[str]
    matched_phrases: list[str]
    is_scam_alert: bool
    message: str
