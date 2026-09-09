"""
Unit and integration tests for the authenticated statement upload API endpoint.
Endpoint: POST /api/v1/statements/upload
"""

import io
from PIL import Image
import pypdf
import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.services.statement_extraction_service import extraction_service


@pytest.fixture
def auth_user_and_headers(client: TestClient):
    """Creates a test user and returns an Authorization header with a valid JWT."""
    res = client.post(
        "/api/v1/users",
        json={"name": "Statement Test User", "phone_number": "+91-99887-76655"},
    )
    assert res.status_code == 201
    user_id = res.json()["id"]
    token = create_access_token({"sub": str(user_id)})
    return user_id, {"Authorization": f"Bearer {token}"}


def test_statement_upload_pdf_success(client: TestClient, auth_user_and_headers):
    """Valid PDF statement upload with auth returns 200 and receipt."""
    user_id, headers = auth_user_and_headers
    pdf_bytes = b"%PDF-1.4 sample bank statement content for testing baseline"
    files = {
        "file": ("hdfc_statement_august_2026.pdf", io.BytesIO(pdf_bytes), "application/pdf")
    }

    response = client.post("/api/v1/statements/upload", headers=headers, files=files)
    assert response.status_code == 200
    data = response.json()

    assert data["upload_id"].startswith("stmt_upl_")
    assert data["user_id"] == user_id
    assert data["filename"] == "hdfc_statement_august_2026.pdf"
    assert data["content_type"] == "application/pdf"
    assert data["size_bytes"] == len(pdf_bytes)
    assert data["status"] == "RECEIVED"
    assert "uploaded_at" in data
    assert "Statement file successfully uploaded" in data["message"]


def test_statement_upload_image_success(client: TestClient, auth_user_and_headers):
    """Valid PNG image statement upload with auth returns 200 and receipt."""
    user_id, headers = auth_user_and_headers
    img_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRsample_image_data"
    files = {
        "file": ("sbi_passbook_scan.png", io.BytesIO(img_bytes), "image/png")
    }

    response = client.post("/api/v1/statements/upload", headers=headers, files=files)
    assert response.status_code == 200
    data = response.json()

    assert data["upload_id"].startswith("stmt_upl_")
    assert data["user_id"] == user_id
    assert data["filename"] == "sbi_passbook_scan.png"
    assert data["content_type"] == "image/png"
    assert data["size_bytes"] == len(img_bytes)
    assert data["status"] == "RECEIVED"


def test_statement_upload_unauthorized_missing_token(client: TestClient):
    """Statement upload without Bearer token returns 401 Unauthorized."""
    pdf_bytes = b"%PDF-1.4 unauthorized test"
    files = {
        "file": ("statement.pdf", io.BytesIO(pdf_bytes), "application/pdf")
    }

    response = client.post("/api/v1/statements/upload", files=files)
    assert response.status_code == 401
    assert "Authentication required" in response.json()["detail"]


def test_statement_upload_unauthorized_invalid_token(client: TestClient):
    """Statement upload with invalid Bearer token returns 401 Unauthorized."""
    pdf_bytes = b"%PDF-1.4 unauthorized test"
    files = {
        "file": ("statement.pdf", io.BytesIO(pdf_bytes), "application/pdf")
    }
    headers = {"Authorization": "Bearer invalid_or_expired_jwt_token"}

    response = client.post("/api/v1/statements/upload", headers=headers, files=files)
    assert response.status_code == 401
    assert "Invalid or expired access token" in response.json()["detail"]


def test_statement_upload_unsupported_file_format(client: TestClient, auth_user_and_headers):
    """Upload with unsupported format (e.g. .exe / binary) returns 400 Bad Request."""
    _, headers = auth_user_and_headers
    exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00malicious_executable"
    files = {
        "file": ("statement.exe", io.BytesIO(exe_bytes), "application/octet-stream")
    }

    response = client.post("/api/v1/statements/upload", headers=headers, files=files)
    assert response.status_code == 400
    assert "Unsupported statement format" in response.json()["detail"]


def test_statement_upload_empty_file_rejected(client: TestClient, auth_user_and_headers):
    """Upload with empty file (0 bytes) returns 400 Bad Request."""
    _, headers = auth_user_and_headers
    empty_bytes = b""
    files = {
        "file": ("empty_statement.pdf", io.BytesIO(empty_bytes), "application/pdf")
    }

    response = client.post("/api/v1/statements/upload", headers=headers, files=files)
    assert response.status_code == 400
    assert "is empty (0 bytes)" in response.json()["detail"]


def test_statement_upload_oversized_file_rejected(client: TestClient, auth_user_and_headers):
    """Upload exceeding 10 MB returns 400 Bad Request."""
    _, headers = auth_user_and_headers
    # 10 MB + 1 KB
    oversized_bytes = b"0" * (10 * 1024 * 1024 + 1024)
    files = {
        "file": ("huge_statement.pdf", io.BytesIO(oversized_bytes), "application/pdf")
    }

    response = client.post("/api/v1/statements/upload", headers=headers, files=files)
    assert response.status_code == 400
    assert "exceeds maximum allowed size of 10 MB" in response.json()["detail"]


def test_get_statement_status_success(client: TestClient, auth_user_and_headers):
    """Retrieving status of an uploaded statement returns 200 and initial RECEIVED status."""
    user_id, headers = auth_user_and_headers
    pdf_bytes = b"%PDF-1.4 test status statement"
    files = {"file": ("my_bank_statement.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
    assert upload_res.status_code == 200
    upload_id = upload_res.json()["upload_id"]

    status_res = client.get(f"/api/v1/statements/{upload_id}/status", headers=headers)
    assert status_res.status_code == 200
    data = status_res.json()

    assert data["upload_id"] == upload_id
    assert data["user_id"] == user_id
    assert data["filename"] == "my_bank_statement.pdf"
    assert data["status"] == "RECEIVED"
    assert data["error_detail"] is None
    assert "created_at" in data
    assert "updated_at" in data


def test_update_statement_status_processing_and_completed(client: TestClient, auth_user_and_headers):
    """Status can transition from RECEIVED -> PROCESSING -> COMPLETED."""
    user_id, headers = auth_user_and_headers
    pdf_bytes = b"%PDF-1.4 test status progression"
    files = {"file": ("progression_statement.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
    upload_id = upload_res.json()["upload_id"]

    # Transition to PROCESSING
    patch1 = client.patch(
        f"/api/v1/statements/{upload_id}/status",
        headers=headers,
        json={"status": "PROCESSING"},
    )
    assert patch1.status_code == 200
    assert patch1.json()["status"] == "PROCESSING"

    # Transition to COMPLETED
    patch2 = client.patch(
        f"/api/v1/statements/{upload_id}/status",
        headers=headers,
        json={"status": "COMPLETED"},
    )
    assert patch2.status_code == 200
    assert patch2.json()["status"] == "COMPLETED"
    assert "completed successfully" in patch2.json()["message"]


def test_update_statement_status_failed(client: TestClient, auth_user_and_headers):
    """Status can transition to FAILED with custom error_detail."""
    user_id, headers = auth_user_and_headers
    pdf_bytes = b"%PDF-1.4 test failure"
    files = {"file": ("corrupted_statement.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
    upload_id = upload_res.json()["upload_id"]

    patch_res = client.patch(
        f"/api/v1/statements/{upload_id}/status",
        headers=headers,
        json={
            "status": "FAILED",
            "message": "Document contains unreadable scanned text.",
            "error_detail": "OCR_SCAN_UNREADABLE: Resolution too low or password-locked.",
        },
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["status"] == "FAILED"
    assert "unreadable scanned text" in data["message"]
    assert "OCR_SCAN_UNREADABLE" in data["error_detail"]


def test_get_statement_status_unauthorized(client: TestClient):
    """Querying status without Authorization header returns 401."""
    res = client.get("/api/v1/statements/stmt_upl_any123/status")
    assert res.status_code == 401


def test_get_statement_status_not_found(client: TestClient, auth_user_and_headers):
    """Querying a non-existent upload_id returns 404."""
    _, headers = auth_user_and_headers
    res = client.get("/api/v1/statements/stmt_upl_doesnotexist/status", headers=headers)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"]


def test_get_statement_status_forbidden_for_different_user(client: TestClient, auth_user_and_headers):
    """User B cannot access or modify statement uploaded by User A (returns 403)."""
    user_a_id, headers_a = auth_user_and_headers

    # Create User B
    res_b = client.post(
        "/api/v1/users",
        json={"name": "Statement User B", "phone_number": "+91-99887-11223"},
    )
    assert res_b.status_code == 201
    user_b_id = res_b.json()["id"]
    token_b = create_access_token({"sub": str(user_b_id)})
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A uploads statement
    pdf_bytes = b"%PDF-1.4 user A document"
    files = {"file": ("user_a_statement.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    upload_res = client.post("/api/v1/statements/upload", headers=headers_a, files=files)
    upload_id = upload_res.json()["upload_id"]

    # User B attempts to read status
    get_res = client.get(f"/api/v1/statements/{upload_id}/status", headers=headers_b)
    assert get_res.status_code == 403
    assert "not authorized" in get_res.json()["detail"]

    # User B attempts to modify status
    patch_res = client.patch(
        f"/api/v1/statements/{upload_id}/status",
        headers=headers_b,
        json={"status": "COMPLETED"},
    )
    assert patch_res.status_code == 403
    assert "not authorized" in patch_res.json()["detail"]


def _generate_test_pdf_bytes() -> bytes:
    """Helper to generate a clean 2-page PDF document containing readable text."""
    return b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 53 >>
stream
BT
/F1 12 Tf
72 712 Td
(HDFC Bank Statement Page 1) Tj
ET
endstream
endobj
6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>
endobj
7 0 obj
<< /Length 53 >>
stream
BT
/F1 12 Tf
72 712 Td
(Closing Balance INR 50000) Tj
ET
endstream
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000122 00000 n 
0000000236 00000 n 
0000000312 00000 n 
0000000416 00000 n 
0000000530 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
634
%%EOF"""


def test_extract_pdf_statement_success(client: TestClient, auth_user_and_headers):
    """
    Valid multi-page PDF extracts page-by-page preserving page boundaries,
    transitions status to COMPLETED, and stores extraction metadata.
    """
    user_id, headers = auth_user_and_headers
    pdf_bytes = _generate_test_pdf_bytes()
    files = {"file": ("hdfc_august.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
    assert upload_res.status_code == 200
    upload_id = upload_res.json()["upload_id"]

    # Trigger extraction
    extract_res = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
    assert extract_res.status_code == 200
    data = extract_res.json()

    assert data["upload_id"] == upload_id
    assert data["status"] == "COMPLETED"
    assert data["total_pages"] == 2
    assert len(data["pages"]) == 2

    # Check page boundaries and content
    assert data["pages"][0]["page_number"] == 1
    assert "HDFC Bank Statement Page 1" in data["pages"][0]["text"]
    assert data["pages"][0]["char_count"] > 0

    assert data["pages"][1]["page_number"] == 2
    assert "Closing Balance INR 50000" in data["pages"][1]["text"]
    assert data["pages"][1]["char_count"] > 0

    assert "--- Page 1 ---" in data["raw_text"]
    assert "--- Page 2 ---" in data["raw_text"]

    # Verify document metadata
    meta = data["document_metadata"]
    assert meta["format"] == "application/pdf"
    assert meta["page_count"] == 2
    assert meta["total_characters"] == sum(p["char_count"] for p in data["pages"])

    # Verify status endpoint reflects COMPLETED
    status_res = client.get(f"/api/v1/statements/{upload_id}/status", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "COMPLETED"

    # Verify extraction retrieval endpoint
    get_ext_res = client.get(f"/api/v1/statements/{upload_id}/extraction", headers=headers)
    assert get_ext_res.status_code == 200
    assert get_ext_res.json()["status"] == "COMPLETED"
    assert get_ext_res.json()["total_pages"] == 2


def test_extract_image_statement_success(client: TestClient, auth_user_and_headers):
    """
    Valid image statement extracts text via OCR adapter, preserving single-page
    boundaries and image document metadata.
    """
    user_id, headers = auth_user_and_headers

    # Create real PNG image using Pillow
    img = Image.new("RGB", (120, 80), color=(240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    # Configure mock OCR engine hook
    def mock_ocr(raw: bytes, mime: str) -> str:
        return "STATE BANK OF INDIA\nUPI TRANSFER CR 1500.00\nBAL: INR 35,000.00"

    extraction_service.set_ocr_engine(mock_ocr)
    try:
        files = {"file": ("sbi_statement_snippet.png", io.BytesIO(png_bytes), "image/png")}
        upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
        assert upload_res.status_code == 200
        upload_id = upload_res.json()["upload_id"]

        extract_res = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
        assert extract_res.status_code == 200
        data = extract_res.json()

        assert data["upload_id"] == upload_id
        assert data["status"] == "COMPLETED"
        assert data["total_pages"] == 1
        assert len(data["pages"]) == 1
        assert data["pages"][0]["page_number"] == 1
        assert "STATE BANK OF INDIA" in data["pages"][0]["text"]
        assert "--- Page 1 ---" in data["raw_text"]
        assert data["document_metadata"]["format"] == "image/png"
        assert data["document_metadata"]["page_count"] == 1
    finally:
        extraction_service.set_ocr_engine(None)


def test_extract_unreadable_blank_pdf(client: TestClient, auth_user_and_headers):
    """
    PDF with 0 extractable text fails safely with OCR_SCAN_UNREADABLE and status FAILED.
    """
    user_id, headers = auth_user_and_headers

    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=300, height=300)
    buf = io.BytesIO()
    writer.write(buf)
    blank_pdf_bytes = buf.getvalue()

    files = {"file": ("scanned_empty_statement.pdf", io.BytesIO(blank_pdf_bytes), "application/pdf")}
    upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
    upload_id = upload_res.json()["upload_id"]

    extract_res = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
    assert extract_res.status_code == 200
    data = extract_res.json()

    assert data["status"] == "FAILED"
    assert "OCR_SCAN_UNREADABLE" in data["error_detail"]

    # Verify status endpoint reflects FAILED
    status_res = client.get(f"/api/v1/statements/{upload_id}/status", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "FAILED"
    assert "OCR_SCAN_UNREADABLE" in status_res.json()["error_detail"]


def test_extract_malformed_pdf(client: TestClient, auth_user_and_headers):
    """Corrupted PDF bytes fail safely with PDF_MALFORMED and status FAILED."""
    user_id, headers = auth_user_and_headers
    corrupt_bytes = b"%PDF-corrupted_invalid_header_payload_junk_12345"

    files = {"file": ("corrupted.pdf", io.BytesIO(corrupt_bytes), "application/pdf")}
    upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
    upload_id = upload_res.json()["upload_id"]

    extract_res = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
    assert extract_res.status_code == 200
    data = extract_res.json()

    assert data["status"] == "FAILED"
    assert "PDF_MALFORMED" in data["error_detail"]


def test_extract_malformed_image(client: TestClient, auth_user_and_headers):
    """Corrupted image bytes fail safely with IMAGE_MALFORMED and status FAILED."""
    user_id, headers = auth_user_and_headers
    corrupt_img = b"\x89PNG\r\n\x1a\ncorrupted_image_header_bytes"

    files = {"file": ("corrupt_passbook.png", io.BytesIO(corrupt_img), "image/png")}
    upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
    upload_id = upload_res.json()["upload_id"]

    extract_res = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
    assert extract_res.status_code == 200
    data = extract_res.json()

    assert data["status"] == "FAILED"
    assert "IMAGE_MALFORMED" in data["error_detail"]


def test_extract_missing_upload_id(client: TestClient, auth_user_and_headers):
    """Extracting a non-existent upload_id returns 404 Not Found."""
    _, headers = auth_user_and_headers
    res = client.post("/api/v1/statements/stmt_upl_doesnotexist999/extract", headers=headers)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"]


def test_extract_unauthorized(client: TestClient):
    """Extracting without Authorization header returns 401 Unauthorized."""
    res = client.post("/api/v1/statements/stmt_upl_sample/extract")
    assert res.status_code == 401


def test_extract_forbidden_for_different_user(client: TestClient, auth_user_and_headers):
    """User B cannot trigger extraction for User A's statement (403 Forbidden)."""
    user_a_id, headers_a = auth_user_and_headers

    # Create User B
    res_b = client.post(
        "/api/v1/users",
        json={"name": "Statement User B Extract", "phone_number": "+91-99887-55443"},
    )
    user_b_id = res_b.json()["id"]
    token_b = create_access_token({"sub": str(user_b_id)})
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A uploads statement
    pdf_bytes = _generate_test_pdf_bytes()
    files = {"file": ("user_a_doc.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    upload_res = client.post("/api/v1/statements/upload", headers=headers_a, files=files)
    upload_id = upload_res.json()["upload_id"]

    # User B attempts extraction
    extract_res = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers_b)
    assert extract_res.status_code == 403
    assert "not authorized" in extract_res.json()["detail"]


def test_extract_non_received_status_rejected(client: TestClient, auth_user_and_headers):
    """Attempting extraction on a statement that is already COMPLETED returns 400."""
    user_id, headers = auth_user_and_headers
    pdf_bytes = _generate_test_pdf_bytes()
    files = {"file": ("completed_doc.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
    upload_id = upload_res.json()["upload_id"]

    # First extraction succeeds -> status becomes COMPLETED
    first_extract = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
    assert first_extract.status_code == 200
    assert first_extract.json()["status"] == "COMPLETED"

    # Second extraction attempt should be rejected because status is no longer RECEIVED
    second_extract = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
    assert second_extract.status_code == 400
    assert "RECEIVED" in second_extract.json()["detail"]


def test_get_ocr_status_endpoint(client: TestClient, auth_user_and_headers):
    """
    GET /api/v1/statements/ocr/status returns OCR engine health diagnostics.
    Does not crash even when local Tesseract binary is not installed.
    """
    _, headers = auth_user_and_headers
    extraction_service.set_ocr_engine(None)

    res = client.get("/api/v1/statements/ocr/status", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "available" in data
    assert data["engine"] == "tesseract"
    assert "supported_formats" in data
    assert "scanned_pdf" in data["supported_formats"]
    assert "image/png" in data["supported_formats"]
    assert "message" in data


def test_get_ocr_status_with_custom_injected_engine(client: TestClient, auth_user_and_headers):
    """
    GET /api/v1/statements/ocr/status reports active injected engine when registered.
    """
    _, headers = auth_user_and_headers
    extraction_service.set_ocr_engine(lambda raw, mime: "mocked text")
    try:
        res = client.get("/api/v1/statements/ocr/status", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["available"] is True
        assert data["engine"] == "custom_injected_ocr"
        assert "injected" in data["message"].lower()
    finally:
        extraction_service.set_ocr_engine(None)


def test_extract_scanned_pdf_with_ocr(client: TestClient, auth_user_and_headers):
    """
    Multi-page scanned PDF (raster images with zero embedded digital text)
    successfully extracts text page-by-page when OCR engine is active,
    preserving page boundaries and returning format 'application/pdf (scanned_ocr)'.
    """
    user_id, headers = auth_user_and_headers

    # Create 2-page raster-only scanned PDF using Pillow
    img1 = Image.new("RGB", (180, 120), color=(250, 250, 250))
    img2 = Image.new("RGB", (180, 120), color=(250, 250, 250))
    buf = io.BytesIO()
    img1.save(buf, format="PDF", save_all=True, append_images=[img2])
    scanned_pdf_bytes = buf.getvalue()

    # Track OCR calls to verify page extraction
    page_counter = [0]

    def mock_pdf_ocr(raw: bytes, mime: str) -> str:
        page_counter[0] += 1
        return f"SCANNED STATEMENT PAGE {page_counter[0]} TXT\nBALANCE: INR 25000"

    extraction_service.set_ocr_engine(mock_pdf_ocr)
    try:
        files = {"file": ("scanned_bank_passbook.pdf", io.BytesIO(scanned_pdf_bytes), "application/pdf")}
        upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
        assert upload_res.status_code == 200
        upload_id = upload_res.json()["upload_id"]

        extract_res = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
        assert extract_res.status_code == 200
        data = extract_res.json()

        assert data["upload_id"] == upload_id
        assert data["status"] == "COMPLETED"
        assert data["total_pages"] == 2
        assert len(data["pages"]) == 2

        # Page boundaries and content verified
        assert data["pages"][0]["page_number"] == 1
        assert "PAGE 1" in data["pages"][0]["text"]
        assert data["pages"][1]["page_number"] == 2
        assert "PAGE 2" in data["pages"][1]["text"]

        assert "--- Page 1 ---" in data["raw_text"]
        assert "--- Page 2 ---" in data["raw_text"]
        assert "scanned_ocr" in data["document_metadata"]["format"]
        assert data["document_metadata"]["page_count"] == 2
    finally:
        extraction_service.set_ocr_engine(None)


def test_extract_scanned_pdf_fails_safely_when_ocr_unavailable(client: TestClient, auth_user_and_headers):
    """
    Scanned/raster-only PDF with 0 extractable digital text fails safely
    with OCR_SCAN_UNREADABLE and status FAILED when OCR yields no text.
    """
    user_id, headers = auth_user_and_headers

    # Create 1-page raster PDF using Pillow
    img = Image.new("RGB", (150, 100), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    raster_pdf_bytes = buf.getvalue()

    # Mock OCR returning None (e.g. OCR binary missing or scan unreadable)
    extraction_service.set_ocr_engine(lambda raw, mime: None)
    try:
        files = {"file": ("unreadable_scan.pdf", io.BytesIO(raster_pdf_bytes), "application/pdf")}
        upload_res = client.post("/api/v1/statements/upload", headers=headers, files=files)
        upload_id = upload_res.json()["upload_id"]

        extract_res = client.post(f"/api/v1/statements/{upload_id}/extract", headers=headers)
        assert extract_res.status_code == 200
        data = extract_res.json()

        assert data["status"] == "FAILED"
        assert "OCR_SCAN_UNREADABLE" in data["error_detail"]

        # Verify status endpoint reflects FAILED
        status_res = client.get(f"/api/v1/statements/{upload_id}/status", headers=headers)
        assert status_res.status_code == 200
        assert status_res.json()["status"] == "FAILED"
    finally:
        extraction_service.set_ocr_engine(None)

