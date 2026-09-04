"""AVARAN PAY spec §6: a Guardian request past its 120s deadline must be
expired by the background sweep even if nothing has read/polled it — and
once expired, the transaction can never launch a UPI app. See
app/services/guardian_service.py (the sweep shared with app/main.py's
lifespan worker, disabled under the test harness — see tests/conftest.py)."""

from datetime import datetime, timedelta, timezone

from app.models.guardian_request import GuardianRequest
from app.services import guardian_service


def _setup_high_risk_pending_guardian(client, db_session):
    user_id = client.post(
        "/api/v1/users", json={"name": "Latha Iyer", "phone_number": "+91-95555-66666"}
    ).json()["id"]
    contact_id = client.post(
        "/api/v1/guardian/trusted-contacts",
        json={
            "user_id": user_id,
            "contact_name": "Rahul Iyer (Son)",
            "phone_number": "+91-97777-88888",
            "relationship": "Child",
        },
    ).json()["id"]
    txn_id = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "scam.recipient@upi",
            "device_identifier": "device-latha",
            "amount": "72000.00",
        },
    ).json()["id"]

    req_id = client.post(
        "/api/v1/guardian/requests", json={"transaction_id": txn_id, "trusted_contact_id": contact_id}
    ).json()["id"]

    req = db_session.get(GuardianRequest, req_id)
    req.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    return user_id, txn_id, req_id


def test_sweep_expires_request_without_being_polled(client, db_session):
    user_id, txn_id, req_id = _setup_high_risk_pending_guardian(client, db_session)

    expired_count = guardian_service.sweep_expired_requests(db_session)
    assert expired_count >= 1

    # No GET on the request/transaction has happened yet — the proactive
    # sweep alone must have already flipped both records.
    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "GUARDIAN_TIMEOUT"

    req = client.get(f"/api/v1/guardian/requests/{req_id}").json()
    assert req["outcome"] == "TIMEOUT"


def test_launch_upi_blocked_after_guardian_timeout(client, db_session):
    user_id, txn_id, req_id = _setup_high_risk_pending_guardian(client, db_session)
    guardian_service.sweep_expired_requests(db_session)

    res = client.post(
        f"/api/v1/payments/{txn_id}/launch-upi",
        json={"app": "GPAY", "amount": "72000.00", "recipient_identifier": "scam.recipient@upi"},
    )
    assert res.status_code == 400


def test_sweep_is_idempotent_on_already_resolved_requests(db_session, client):
    user_id, txn_id, req_id = _setup_high_risk_pending_guardian(client, db_session)
    first = guardian_service.sweep_expired_requests(db_session)
    assert first >= 1
    second = guardian_service.sweep_expired_requests(db_session)
    assert second == 0
