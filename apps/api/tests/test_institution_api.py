def test_institution_transactions_and_stats(client):
    # Get stats
    stats_res = client.get("/api/v1/institution/stats")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert "total_transactions_evaluated" in stats
    assert "average_latency_ms" in stats

    # List feed
    feed_res = client.get("/api/v1/institution/transactions?limit=10")
    assert feed_res.status_code == 200
    assert isinstance(feed_res.json(), list)


def test_institution_dispute_resolution(client):
    user_id = client.post("/api/v1/users", json={"name": "Dev Analyst", "phone_number": "+91-95555-66666"}).json()["id"]
    txn_id = client.post(
        "/api/v1/transactions",
        json={"user_id": user_id, "recipient_identifier": "dispute.target@upi", "device_identifier": "dev-device", "amount": "4000.00"},
    ).json()["id"]

    res = client.post(
        f"/api/v1/institution/disputes/{txn_id}/resolve",
        json={"status": "FALSE_POSITIVE", "notes": "Customer confirmed legitimate transaction."},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "FALSE_POSITIVE"
