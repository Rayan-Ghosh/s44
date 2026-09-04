"""Integration tests for /api/v1/demo, the dynamic backend-persisted demo
transaction generator (AVARAN PAY spec §9)."""


def test_list_scenarios_returns_ten_scenarios(client):
    res = client.get("/api/v1/demo/scenarios")
    assert res.status_code == 200
    scenarios = res.json()
    assert len(scenarios) == 10
    ids = {s["id"] for s in scenarios}
    assert "low_continue" in ids
    assert "high_guardian_timeout" in ids


def test_generate_transaction_persists_and_is_demo_flagged(client):
    res = client.post("/api/v1/demo/generate-transaction", json={"scenario_id": "low_continue"})
    assert res.status_code == 200
    body = res.json()
    assert body["is_demo"] is True
    assert body["status"] == "COMPLETED"

    txn_id = body["transaction_id"]

    # Visible through the same API real transactions use (spec §9: "Returned
    # through the same APIs used by the real frontend").
    full = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert full["id"] == txn_id

    demo_list = client.get("/api/v1/demo/transactions").json()
    assert any(t["transaction_id"] == txn_id for t in demo_list)


def test_generate_transaction_unknown_scenario_404s(client):
    res = client.post("/api/v1/demo/generate-transaction", json={"scenario_id": "not_a_real_scenario"})
    assert res.status_code == 404


def test_high_guardian_rejected_scenario_ends_rejected(client):
    res = client.post("/api/v1/demo/generate-transaction", json={"scenario_id": "high_guardian_rejected"})
    assert res.status_code == 200
    assert res.json()["status"] == "GUARDIAN_REJECTED"
    assert res.json()["guardian_required"] is True


def test_high_guardian_timeout_scenario_ends_timeout(client):
    res = client.post("/api/v1/demo/generate-transaction", json={"scenario_id": "high_guardian_timeout"})
    assert res.status_code == 200
    assert res.json()["status"] == "GUARDIAN_TIMEOUT"


def test_duplicate_confirmation_scenario_stays_completed_once(client):
    res = client.post(
        "/api/v1/demo/generate-transaction", json={"scenario_id": "duplicate_confirmation_attempt"}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "COMPLETED"


def test_reset_clears_only_demo_transactions(client):
    real_user = client.post(
        "/api/v1/users", json={"name": "Real User", "phone_number": "+91-96666-77790"}
    ).json()["id"]
    real_txn = client.post(
        "/api/v1/transactions",
        json={
            "user_id": real_user,
            "recipient_identifier": "friend@upi",
            "device_identifier": "device-real",
            "amount": "100.00",
        },
    ).json()["id"]

    demo_res = client.post("/api/v1/demo/generate-transaction", json={"scenario_id": "low_cancel"})
    demo_txn_id = demo_res.json()["transaction_id"]

    reset_res = client.post("/api/v1/demo/reset")
    assert reset_res.status_code == 200
    assert reset_res.json()["deleted_transactions"] >= 1

    demo_list = client.get("/api/v1/demo/transactions").json()
    assert not any(t["transaction_id"] == demo_txn_id for t in demo_list)

    # Real (non-demo) transaction is untouched.
    still_there = client.get(f"/api/v1/transactions/{real_txn}")
    assert still_there.status_code == 200
