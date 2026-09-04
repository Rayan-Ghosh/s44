"""Tests for POST /api/v1/risk/{id}/recipient-evaluate — the real-data,
recipient-centric second opinion (ml/inference/recipient_predictor.py).
Additive to the authoritative /api/v1/risk/evaluate path, not a replacement."""


def _create_txn(client, user_phone, recipient, amount, device="dev-recipient-test"):
    user_id = client.post(
        "/api/v1/users", json={"name": "Recipient Risk Test", "phone_number": user_phone}
    ).json()["id"]
    txn = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": recipient,
            "device_identifier": device,
            "amount": str(amount),
        },
    ).json()
    return user_id, txn["id"]


def test_recipient_evaluate_new_recipient_is_cold(client):
    _, txn_id = _create_txn(client, "+91-98111-00001", "fresh.merchant@upi", "1200.00")
    res = client.post(f"/api/v1/risk/{txn_id}/recipient-evaluate")
    assert res.status_code == 200
    body = res.json()
    assert body["features_used"]["new_recipient"] == 1
    assert body["features_used"]["recipient_prior_count"] == 0
    assert body["features_used"]["recipient_amount_zscore"] is None
    assert body["anomaly_scorable"] is False


def test_recipient_evaluate_flags_amount_far_outside_recipient_history(client):
    user_id = client.post(
        "/api/v1/users", json={"name": "Repeat Payer", "phone_number": "+91-98111-00002"}
    ).json()["id"]

    for amount in ("500.00", "600.00", "550.00", "700.00", "450.00"):
        client.post(
            "/api/v1/transactions",
            json={
                "user_id": user_id,
                "recipient_identifier": "steady.merchant@upi",
                "device_identifier": "dev-repeat",
                "amount": amount,
            },
        )

    spike = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "steady.merchant@upi",
            "device_identifier": "dev-repeat",
            "amount": "50000.00",
        },
    ).json()

    res = client.post(f"/api/v1/risk/{spike['id']}/recipient-evaluate")
    assert res.status_code == 200
    body = res.json()
    assert body["features_used"]["recipient_prior_count"] == 5
    assert body["features_used"]["recipient_amount_zscore"] > 10
    assert body["anomaly_scorable"] is True
    # A 50,000 payment against a ~500-700 history is far outside normal —
    # the model should score it well above its own operating threshold.
    assert body["fraud_probability"] > body["selected_threshold"]


def test_recipient_evaluate_404s_for_unknown_transaction(client):
    res = client.post("/api/v1/risk/999999/recipient-evaluate")
    assert res.status_code == 404


def test_recipient_evaluate_does_not_affect_authoritative_risk_state(client):
    """This endpoint is additive — it must not write a RiskScore row or
    change the transaction's status, unlike POST /api/v1/risk/evaluate."""
    _, txn_id = _create_txn(client, "+91-98111-00003", "isolation.check@upi", "800.00")
    before = client.get(f"/api/v1/transactions/{txn_id}").json()["status"]

    client.post(f"/api/v1/risk/{txn_id}/recipient-evaluate")

    after = client.get(f"/api/v1/transactions/{txn_id}").json()["status"]
    assert before == after
