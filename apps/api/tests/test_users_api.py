def test_create_user_returns_201_and_never_echoes_phone_hash(client):
    response = client.post(
        "/api/v1/users", json={"name": "Ananya Sharma", "phone_number": "+91-90000-11111"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Ananya Sharma"
    assert "id" in body
    assert "created_at" in body
    assert "phone_hash" not in body
    assert "phone_number" not in body


def test_get_user_returns_created_user(client):
    created = client.post(
        "/api/v1/users", json={"name": "Rohit Verma", "phone_number": "+91-90000-22222"}
    ).json()

    response = client.get(f"/api/v1/users/{created['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Rohit Verma"


def test_get_nonexistent_user_returns_404(client):
    response = client.get("/api/v1/users/999999")
    assert response.status_code == 404


def test_duplicate_phone_number_returns_409(client):
    payload = {"name": "First", "phone_number": "+91-90000-33333"}
    first = client.post("/api/v1/users", json=payload)
    assert first.status_code == 201

    duplicate = client.post(
        "/api/v1/users", json={"name": "Second", "phone_number": "+91-90000-33333"}
    )
    assert duplicate.status_code == 409


def test_create_user_missing_name_returns_422(client):
    response = client.post("/api/v1/users", json={"phone_number": "+91-90000-44444"})
    assert response.status_code == 422


def test_create_user_empty_name_returns_422(client):
    response = client.post(
        "/api/v1/users", json={"name": "", "phone_number": "+91-90000-55555"}
    )
    assert response.status_code == 422
