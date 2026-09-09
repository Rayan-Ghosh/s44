"""
Pydantic schemas for statement upload and processing.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class StatementProcessingStatus(str, Enum):
    """
    Processing lifecycle statuses for an uploaded statement document.
    """
    RECEIVED = "RECEIVED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class StatementUploadResponse(BaseModel):
    """
    Response returned when a bank statement is successfully received by the backend.
    """
    upload_id: str = Field(..., description="Unique statement upload tracking ID")
    user_id: int = Field(..., description="Authenticated user ID who uploaded the statement")
    filename: str = Field(..., description="Original filename of the uploaded statement")
    content_type: str = Field(..., description="MIME type of the uploaded statement")
    size_bytes: int = Field(..., description="File size in bytes")
    status: str = Field("RECEIVED", description="Upload processing status (e.g., RECEIVED)")
    message: str = Field(..., description="Human-readable status summary")
    uploaded_at: str = Field(..., description="ISO 8601 UTC timestamp of upload")


class StatementStatusResponse(BaseModel):
    """
    Response returned when querying statement processing status.
    """
    upload_id: str = Field(..., description="Unique statement upload tracking ID")
    user_id: int = Field(..., description="Authenticated user ID who owns the statement")
    filename: str = Field(..., description="Original filename of the statement")
    status: StatementProcessingStatus = Field(..., description="Current statement processing status")
    message: str = Field(..., description="Human-readable processing status description")
    created_at: str = Field(..., description="ISO 8601 UTC timestamp of initial upload")
    updated_at: str = Field(..., description="ISO 8601 UTC timestamp of last status update")
    error_detail: Optional[str] = Field(None, description="Error detail if processing failed")


class StatementStatusUpdateRequest(BaseModel):
    """
    Request model for transitioning statement processing status.
    """
    status: StatementProcessingStatus = Field(..., description="Target processing status")
    message: Optional[str] = Field(None, description="Optional custom status message")
    error_detail: Optional[str] = Field(None, description="Optional error details if status is FAILED")


class StatementPageText(BaseModel):
    """
    Extracted text content from an individual page of a statement document.
    Preserves page boundaries and position.
    """
    page_number: int = Field(..., description="1-indexed page number within the document")
    text: str = Field(..., description="Raw text extracted from this page")
    char_count: int = Field(..., description="Total characters extracted from this page")


class StatementDocumentMetadata(BaseModel):
    """
    Technical and structure metadata for an extracted statement.
    Stores format, page count, and character totals needed for downstream parsing.
    """
    format: str = Field(..., description="Document format: pdf or image type (e.g. image/png)")
    page_count: int = Field(..., description="Total pages/images in the document")
    total_characters: int = Field(..., description="Total characters extracted across all pages")
    extracted_at: str = Field(..., description="ISO 8601 UTC timestamp of extraction")
    file_size_bytes: int = Field(..., description="Original file size in bytes")


class StatementExtractionResponse(BaseModel):
    """
    Result returned by statement text-extraction / OCR processing.
    Contains raw text, per-page structured text, and document metadata.
    """
    upload_id: str = Field(..., description="Unique statement upload tracking ID")
    status: StatementProcessingStatus = Field(..., description="Resulting statement processing status")
    raw_text: str = Field("", description="Aggregated raw document text preserving page boundaries")
    pages: list[StatementPageText] = Field(default_factory=list, description="Per-page extracted text items")
    total_pages: int = Field(0, description="Total number of pages processed")
    total_characters: int = Field(0, description="Total number of characters extracted")
    document_metadata: Optional[StatementDocumentMetadata] = Field(
        None, description="Document structure and extraction metadata"
    )
    message: str = Field(..., description="Human-readable extraction status message")
    error_detail: Optional[str] = Field(None, description="Detailed error code/message if extraction failed")


class StatementOCRStatusResponse(BaseModel):
    """
    Health and availability diagnostics for the local statement OCR engine.
    """
    available: bool = Field(..., description="Whether a local OCR binary is configured and ready")
    engine: str = Field("tesseract", description="Primary OCR engine name")
    version: Optional[str] = Field(None, description="Installed OCR engine version if available")
    binary_path: Optional[str] = Field(None, description="Resolved path to OCR binary if found")
    supported_formats: list[str] = Field(
        default_factory=lambda: [
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp",
            "image/heic",
            "image/heif",
            "scanned_pdf",
        ],
        description="Supported document formats for optical character recognition",
    )
    message: str = Field(..., description="Availability status summary and operational guidance")
    install_instructions: Optional[dict[str, str]] = Field(
        None, description="Installation instructions if binary is not installed"
    )
