"""Health/readiness checks — must keep working through every later phase."""


def test_health_endpoint_responds(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "S40 API"


def test_health_db_endpoint_connects(client):
    response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}
