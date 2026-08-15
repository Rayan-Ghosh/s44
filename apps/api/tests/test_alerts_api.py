from app.models.alert import Alert
from app.models.enums import AlertStatus, RiskLevel


def _create_transaction(client):
    user_id = client.post(
        "/api/v1/users", json={"name": "Meera Pillai", "phone_number": "+91-90000-88888"}
    ).json()["id"]
    return client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "meera.recipient@upi",
            "device_identifier": "device-alert-test",
            "amount": "15000.00",
        },
    ).json()


def test_list_alerts_empty_returns_200_empty_list(client):
    response = client.get("/api/v1/alerts")
    assert response.status_code == 200
    assert response.json() == []


def test_list_alerts_returns_seeded_alert(client, db_session):
    transaction = _create_transaction(client)
    alert = Alert(
        transaction_id=transaction["id"],
        severity=RiskLevel.HIGH,
        status=AlertStatus.OPEN,
        summary="Test alert for API verification.",
    )
    db_session.add(alert)
    db_session.commit()

    response = client.get("/api/v1/alerts")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["severity"] == "HIGH"
    assert body[0]["status"] == "OPEN"


def test_get_alert_by_id(client, db_session):
    transaction = _create_transaction(client)
    alert = Alert(
        transaction_id=transaction["id"],
        severity=RiskLevel.LOW,
        status=AlertStatus.RESOLVED,
        summary="Another test alert.",
    )
    db_session.add(alert)
    db_session.commit()
    db_session.refresh(alert)

    response = client.get(f"/api/v1/alerts/{alert.id}")
    assert response.status_code == 200
    assert response.json()["summary"] == "Another test alert."


def test_get_nonexistent_alert_returns_404(client):
    response = client.get("/api/v1/alerts/999999")
    assert response.status_code == 404
