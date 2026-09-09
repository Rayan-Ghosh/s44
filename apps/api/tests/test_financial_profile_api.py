"""apps/api/app/api/routers/financial_profile.py — statement upload,
model-sync ETag/304 contract, and artifact download, exercised through the
real HTTP app (TestClient) against the synthetic bank-statement PDF
fixtures in tests/fixtures/ (built with reportlab, not hand-crafted —
apps/api/app/services/statement_parser_service.py's own docstring explains
why these are "verified against a synthetic statement, not a real bank's
actual export layout")."""

from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"


def _create_user(client) -> int:
    res = client.post(
        "/api/v1/users",
        json={"name": "Statement Test User", "phone_number": f"+91-90000-{id(client) % 100000:05d}"},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_upload_statement_parses_and_stores_rows(client):
    user_id = _create_user(client)
    with open(FIXTURES / "sample_statement.pdf", "rb") as f:
        res = client.post(
            f"/api/v1/users/{user_id}/statement/upload",
            files={"file": ("statement.pdf", f, "application/pdf")},
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["parsed_rows"] == 5  # 4 DEBIT + 1 CREDIT row in the fixture
    assert body["inserted_rows"] == 5
    assert body["duplicate_rows"] == 0
    # First-ever upload for this user -> bootstrap training runs inline.
    assert body["trained"] is True
    assert body["p50_amount"] is not None


def test_upload_statement_with_hdfc_style_headers_parses_via_dynamic_column_matching(client):
    """Different bank, completely different column names/order/count than
    the first fixture (Value Dt / Narration / Withdrawal Amt. / Deposit
    Amt.) — proves columns are resolved by header text, not position."""
    user_id = _create_user(client)
    with open(FIXTURES / "sample_statement_hdfc_style.pdf", "rb") as f:
        res = client.post(
            f"/api/v1/users/{user_id}/statement/upload",
            files={"file": ("statement.pdf", f, "application/pdf")},
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["parsed_rows"] == 3
    assert body["inserted_rows"] == 3


def test_upload_statement_re_upload_is_deduplicated(client):
    user_id = _create_user(client)
    with open(FIXTURES / "sample_statement.pdf", "rb") as f:
        content = f.read()

    first = client.post(
        f"/api/v1/users/{user_id}/statement/upload",
        files={"file": ("statement.pdf", content, "application/pdf")},
    )
    assert first.json()["inserted_rows"] == 5

    second = client.post(
        f"/api/v1/users/{user_id}/statement/upload",
        files={"file": ("statement.pdf", content, "application/pdf")},
    )
    assert second.status_code == 200
    body = second.json()
    assert body["inserted_rows"] == 0
    assert body["duplicate_rows"] == 5


def test_upload_password_protected_statement_with_correct_password(client):
    user_id = _create_user(client)
    with open(FIXTURES / "sample_statement_protected.pdf", "rb") as f:
        res = client.post(
            f"/api/v1/users/{user_id}/statement/upload",
            files={"file": ("statement.pdf", f, "application/pdf")},
            data={"password": "secret123"},
        )
    assert res.status_code == 200, res.text
    assert res.json()["inserted_rows"] == 1


def test_upload_password_protected_statement_with_wrong_password_returns_422(client):
    user_id = _create_user(client)
    with open(FIXTURES / "sample_statement_protected.pdf", "rb") as f:
        res = client.post(
            f"/api/v1/users/{user_id}/statement/upload",
            files={"file": ("statement.pdf", f, "application/pdf")},
            data={"password": "wrongpassword"},
        )
    assert res.status_code == 422


def test_upload_statement_rejects_oversized_file(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "statement_upload_max_bytes", 100)
    user_id = _create_user(client)
    with open(FIXTURES / "sample_statement.pdf", "rb") as f:
        res = client.post(
            f"/api/v1/users/{user_id}/statement/upload",
            files={"file": ("statement.pdf", f, "application/pdf")},
        )
    assert res.status_code == 413


def test_model_sync_returns_no_model_before_any_training(client):
    user_id = _create_user(client)
    res = client.get(f"/api/v1/users/{user_id}/model-sync")
    assert res.status_code == 200
    body = res.json()
    assert body["has_model"] is False


def test_model_sync_then_304_on_matching_etag(client):
    user_id = _create_user(client)
    with open(FIXTURES / "sample_statement.pdf", "rb") as f:
        upload = client.post(
            f"/api/v1/users/{user_id}/statement/upload",
            files={"file": ("statement.pdf", f, "application/pdf")},
        )
    assert upload.json()["trained"] is True

    first = client.get(f"/api/v1/users/{user_id}/model-sync")
    assert first.status_code == 200
    body = first.json()
    assert body["has_model"] is True
    assert body["kind"] == "quantile-json"
    checksum = body["sha256_checksum"]
    assert body["p50"] is not None

    second = client.get(
        f"/api/v1/users/{user_id}/model-sync",
        headers={"If-None-Match": f'"{checksum}"'},
    )
    assert second.status_code == 304
    assert second.content == b""


def test_model_artifact_download_matches_sync_checksum(client):
    import hashlib

    user_id = _create_user(client)
    with open(FIXTURES / "sample_statement.pdf", "rb") as f:
        client.post(
            f"/api/v1/users/{user_id}/statement/upload",
            files={"file": ("statement.pdf", f, "application/pdf")},
        )

    sync = client.get(f"/api/v1/users/{user_id}/model-sync").json()
    download = client.get(sync["download_url"])
    assert download.status_code == 200
    assert hashlib.sha256(download.content).hexdigest() == sync["sha256_checksum"]


def test_model_artifact_download_404_for_unknown_version(client):
    user_id = _create_user(client)
    res = client.get(f"/api/v1/users/{user_id}/model-artifact/v-does-not-exist")
    assert res.status_code == 404
