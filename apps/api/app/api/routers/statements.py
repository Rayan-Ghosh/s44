"""
Statement upload and processing endpoints.
"""

from datetime import datetime, timezone
import os
import uuid
from typing import Any, Dict, Set

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.statement import (
    StatementExtractionResponse,
    StatementOCRStatusResponse,
    StatementProcessingStatus,
    StatementStatusResponse,
    StatementStatusUpdateRequest,
    StatementUploadResponse,
)
from app.services.statement_extraction_service import extraction_service

router = APIRouter(prefix="/api/v1/statements", tags=["statements"])

SUPPORTED_EXTENSIONS: Set[str] = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".heif",
}

SUPPORTED_MIME_TYPES: Set[str] = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}

MAX_STATEMENT_FILE_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB

# In-memory registry for uploaded statements and processing lifecycle tracking
statement_store: Dict[str, Dict[str, Any]] = {}


@router.post("/upload", response_model=StatementUploadResponse, status_code=status.HTTP_200_OK)
async def upload_statement(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> StatementUploadResponse:
    """
    Authenticated bank statement file upload endpoint.
    Validates file extension, MIME type, and size constraints (<= 10 MB, non-empty).
    Preserves file metadata and returns a unique upload receipt.
    """
    filename = file.filename or "statement_document"
    _, ext = os.path.splitext(filename)
    clean_ext = ext.lower()

    content_type = (file.content_type or "").lower().split(";")[0].strip()

    # Validate file format / extension
    is_valid_ext = clean_ext in SUPPORTED_EXTENSIONS
    is_valid_mime = content_type in SUPPORTED_MIME_TYPES or (
        content_type.startswith("image/") and clean_ext in SUPPORTED_EXTENSIONS
    )

    if not is_valid_ext and not is_valid_mime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported statement format for '{filename}'. "
                f"Please upload a PDF or image statement (.pdf, .jpg, .png, .webp)."
            ),
        )

    # Read content to verify size and presence
    content = await file.read()
    size_bytes = len(content)

    if size_bytes == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Statement file '{filename}' is empty (0 bytes).",
        )

    if size_bytes > MAX_STATEMENT_FILE_SIZE_BYTES:
        mb_size = round(size_bytes / (1024 * 1024), 2)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Statement file '{filename}' ({mb_size} MB) exceeds maximum allowed size of 10 MB.",
        )

    upload_id = f"stmt_upl_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    # Record statement in tracking store
    statement_store[upload_id] = {
        "upload_id": upload_id,
        "user_id": current_user.id,
        "filename": filename,
        "content_type": content_type or "application/octet-stream",
        "size_bytes": size_bytes,
        "raw_bytes": content,
        "status": StatementProcessingStatus.RECEIVED,
        "message": "Statement file successfully uploaded and received for processing.",
        "created_at": now_iso,
        "updated_at": now_iso,
        "error_detail": None,
        "extraction": None,
    }

    return StatementUploadResponse(
        upload_id=upload_id,
        user_id=current_user.id,
        filename=filename,
        content_type=content_type or "application/octet-stream",
        size_bytes=size_bytes,
        status="RECEIVED",
        message="Statement file successfully uploaded and received for processing.",
        uploaded_at=now_iso,
    )


@router.get("/ocr/status", response_model=StatementOCRStatusResponse, status_code=status.HTTP_200_OK)
async def get_ocr_health_status(
    current_user: User = Depends(get_current_user),
) -> StatementOCRStatusResponse:
    """
    Health and availability diagnostics for the local statement OCR engine.
    Reports whether Tesseract OCR binary is installed and provides setup instructions.
    """
    return extraction_service.get_ocr_status()


@router.get("/{upload_id}/status", response_model=StatementStatusResponse, status_code=status.HTTP_200_OK)
async def get_statement_status(
    upload_id: str,
    current_user: User = Depends(get_current_user),
) -> StatementStatusResponse:
    """
    Authenticated endpoint to retrieve the processing status of a statement.
    Validates ownership of the statement (only owner may view status).
    """
    record = statement_store.get(upload_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Statement upload '{upload_id}' not found.",
        )

    if record["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view the status of this statement.",
        )

    return StatementStatusResponse(**record)


@router.patch("/{upload_id}/status", response_model=StatementStatusResponse, status_code=status.HTTP_200_OK)
async def update_statement_status(
    upload_id: str,
    payload: StatementStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
) -> StatementStatusResponse:
    """
    Authenticated endpoint to transition the processing status of a statement.
    Supports RECEIVED, PROCESSING, COMPLETED, and FAILED.
    """
    record = statement_store.get(upload_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Statement upload '{upload_id}' not found.",
        )

    if record["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to modify the status of this statement.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    record["status"] = payload.status
    record["updated_at"] = now_iso

    if payload.message:
        record["message"] = payload.message
    else:
        if payload.status == StatementProcessingStatus.PROCESSING:
            record["message"] = "Statement document is currently being processed."
        elif payload.status == StatementProcessingStatus.COMPLETED:
            record["message"] = "Statement processing completed successfully."
        elif payload.status == StatementProcessingStatus.FAILED:
            record["message"] = "Statement processing failed."
        else:
            record["message"] = "Statement received and queued for processing."

    if payload.status == StatementProcessingStatus.FAILED:
        record["error_detail"] = payload.error_detail or "Unspecified processing failure."
    else:
        record["error_detail"] = None

    return StatementStatusResponse(**record)


@router.post("/{upload_id}/extract", response_model=StatementExtractionResponse, status_code=status.HTTP_200_OK)
async def extract_statement_text(
    upload_id: str,
    current_user: User = Depends(get_current_user),
) -> StatementExtractionResponse:
    """
    Authenticated endpoint to execute text-extraction / OCR on a statement.
    Accepts statement in RECEIVED status, extracts raw text with page boundaries,
    transitions status (RECEIVED -> PROCESSING -> COMPLETED or FAILED), and stores
    extracted text/metadata for subsequent parsing.
    """
    return extraction_service.extract_statement(
        upload_id=upload_id,
        current_user_id=current_user.id,
        statement_store=statement_store,
    )


@router.get("/{upload_id}/extraction", response_model=StatementExtractionResponse, status_code=status.HTTP_200_OK)
async def get_statement_extraction(
    upload_id: str,
    current_user: User = Depends(get_current_user),
) -> StatementExtractionResponse:
    """
    Authenticated endpoint to retrieve stored statement extraction results.
    """
    record = statement_store.get(upload_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Statement upload '{upload_id}' not found.",
        )

    if record["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view the extraction of this statement.",
        )

    extraction_data = record.get("extraction")
    if extraction_data:
        return StatementExtractionResponse(**extraction_data)

    return StatementExtractionResponse(
        upload_id=upload_id,
        status=record["status"],
        raw_text="",
        pages=[],
        total_pages=0,
        total_characters=0,
        document_metadata=None,
        message=record["message"],
        error_detail=record.get("error_detail"),
    )
