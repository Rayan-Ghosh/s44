"""
Integration & Verification Tests for Real-Time Call Fraud Detection Pipeline.

Tests:
1. Bhashini Streaming STT client initialization and payload generation.
2. Stateful Fraud Risk Engine Leaky Bucket math & alert state transitions.
3. End-to-End WebSocket audio streaming & scam dialogue simulation with latency checks.
"""

import time
import json
import pytest
import asyncio
from fastapi.testclient import TestClient

from main import app
from services.bhashini_stt import BhashiniStreamingClient, TranscriptSegment
from engine.fraud_detector import FraudRiskEngine, RiskState, FraudAlertPayload
from session_manager import session_manager, CallSession


@pytest.mark.asyncio
async def test_bhashini_stt_client_start_payload():
    """Verifies Bhashini client start control frame format and mock streaming."""
    client = BhashiniStreamingClient(language="hi", mock_mode=True)
    payload = client.build_start_payload()

    assert payload["event"] == "start"
    assert payload["language"] == "hi"
    assert payload["useVad"] is True
    assert payload["inputEncoding"]["encoding"] == "linear16"
    assert payload["inputEncoding"]["samplingRate"] == 16000
    assert payload["inputEncoding"]["bitsPerSample"] == 16
    assert payload["inputEncoding"]["numChannels"] == 1
    assert payload["vadConfig"]["pStart"] == 0.6
    assert payload["vadConfig"]["pauseMs"] == 400

    connected = await client.connect()
    assert connected is True
    assert client.is_connected is True

    # Send 10 simulated 16kHz audio chunks (320 bytes = 10ms frame at 16kHz 16-bit PCM)
    pcm_frame = b"\x00\x00" * 160
    for _ in range(10):
        await client.send_audio_chunk(pcm_frame)

    await client.close()
    assert client.is_connected is False


@pytest.mark.asyncio
async def test_fraud_detector_leaky_bucket_accumulation():
    """Tests Stateful Fraud Detector leaky bucket risk accumulation and state transitions."""
    engine = FraudRiskEngine(gamma=0.85, window_seconds=60.0)

    # 1. Normal utterance
    state, score, alert = engine.process_utterance("Namaste, kaise hai aap?")
    assert state in (RiskState.NORMAL, RiskState.MONITORING)
    assert alert is None

    # 2. Threat / Coercion trigger
    state, score, alert = engine.process_utterance("Main CBI officer bol raha hu, aap par Digital Arrest ka order hai.")
    assert score > 20.0
    assert state in (RiskState.NORMAL, RiskState.MONITORING)

    # 3. Remote access trigger (escalation phase)
    state, score, alert = engine.process_utterance("Turant AnyDesk app download karo aur screen share karo.")
    assert score > 50.0

    # 4. Financial harvesting trigger (critical threshold)
    state, score, alert = engine.process_utterance("Abhi OTP batao aur UPI PIN enter karo.")
    assert score >= 75.0
    assert state == RiskState.FRAUD_ALERT
    assert alert is not None
    assert alert.event == "FRAUD_ALERT"
    assert alert.risk_score >= 75
    assert alert.detected_pattern in ("REMOTE_ACCESS_COERCION", "FINANCIAL_CREDENTIAL_EXTRACTION", "AUTHORITY_IMPERSONATION")
    assert "OTP" in alert.warning_message or "AnyDesk" in alert.warning_message or "credentials" in alert.warning_message


def test_fastapi_health_endpoint():
    """Verifies health check endpoint returns 200 OK."""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "active_sessions" in data


def test_websocket_scam_simulation_pipeline():
    """
    End-to-end integration test over WebSocket:
    Streams 16kHz PCM audio frames, injects scam dialogue, and asserts:
    - Audio streams without socket starvation.
    - STT response parser captures partial/final text.
    - FRAUD_ALERT triggers within 1.5 seconds of trigger phrase finalization.
    """
    client = TestClient(app)
    session_id = "test-scam-call-999"

    with client.websocket_connect(f"/ws/call-stream/{session_id}?mock=true") as websocket:
        start_time = time.time()

        # Send live 16kHz PCM audio frames (10 frames of 320 bytes) to ensure no socket starvation
        dummy_pcm_frame = b"\x01\x00" * 160
        for _ in range(10):
            websocket.send_bytes(dummy_pcm_frame)

        # Inject scam dialogue sequence simulating live call
        scam_utterances = [
            "Namaste, main Bijli Department se bol raha hu, aapka Bijli connection cut kar diya jayega.",
            "Aap par Digital Arrest ka order hai, CBI officer line par hai.",
            "Play Store se AnyDesk app download karo aur screen share karo.",
            "Abhi apna UPI PIN enter karo aur OTP batao.",
        ]

        received_alerts = []
        received_updates = []
        alert_trigger_time = None

        for text in scam_utterances:
            t0 = time.time()
            websocket.send_json({"event": "inject_mock", "text": text, "is_final": True})

            # Read WebSocket messages until update/alert received
            while True:
                data = websocket.receive_json()
                event_type = data.get("event")

                if event_type == "TRANSCRIPT_UPDATE":
                    received_updates.append(data)

                if event_type == "FRAUD_ALERT":
                    alert_trigger_time = time.time() - t0
                    received_alerts.append(data)
                    break

                # If received update for current text, break inner loop to send next utterance
                if event_type == "TRANSCRIPT_UPDATE" and data.get("text") == text:
                    break

        # Assertions
        assert len(received_updates) > 0, "No transcript updates received over WebSocket."
        assert len(received_alerts) == 1, "Expected exactly 1 FRAUD_ALERT trigger."

        alert_payload = received_alerts[0]
        assert alert_payload["event"] == "FRAUD_ALERT"
        assert alert_payload["session_id"] == session_id
        assert alert_payload["risk_score"] >= 75
        assert alert_payload["detected_pattern"] in (
            "REMOTE_ACCESS_COERCION",
            "FINANCIAL_CREDENTIAL_EXTRACTION",
            "AUTHORITY_IMPERSONATION",
        )
        assert len(alert_payload["warning_message"]) > 10

        # Assert alert triggers within 1.5s of trigger phrase finalization
        assert alert_trigger_time is not None
        assert alert_trigger_time <= 1.5, f"Alert response time {alert_trigger_time:.3f}s exceeded 1.5s threshold!"

        # Send clean stop event
        websocket.send_json({"event": "stop"})
