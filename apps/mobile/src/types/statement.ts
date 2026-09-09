/**
 * Statement Types & Models
 * (`apps/mobile/src/types/statement.ts`)
 *
 * Strongly-typed models for bank/UPI statement document selection,
 * metadata validation, and backend upload responses.
 */

/**
 * Supported statement file categories.
 */
export type StatementFileType = "pdf" | "image";

/**
 * Validated metadata for a selected statement file.
 */
export interface SelectedStatementFile {
  /** Local file://, content://, or blob URI to the selected document */
  uri: string;
  /** Original filename including extension */
  name: string;
  /** File size in bytes */
  size: number;
  /** Resolved or normalized MIME type */
  mimeType: string;
  /** Categorized file type ('pdf' or 'image') */
  fileType: StatementFileType;
  /** Lowercase file extension including dot (e.g. '.pdf') */
  extension: string;
  /** Unix timestamp in milliseconds of last modification, if available */
  lastModified?: number;
}

/**
 * Typed parameters for uploading a statement file to the backend.
 */
export interface StatementUploadRequest {
  file: SelectedStatementFile;
}

/**
 * Response model returned by POST /api/v1/users/{userId}/statement/upload
 * (the personalized transaction-pattern engine's endpoint — see
 * apps/api/app/services/statement_parser_service.py::ingest_statement,
 * which now backs StatementUploadCard.tsx instead of the original
 * /api/v1/statements/upload OCR-preview endpoint).
 *
 * `upload_id`/`status`/`message`/`filename`/`size_bytes`/`uploaded_at`
 * are a compatibility superset so this existing UI component keeps
 * working unmodified — see that function's docstring. `status` is
 * always terminal (COMPLETED/FAILED): this call is synchronous
 * end-to-end, there is no RECEIVED/PROCESSING phase to poll for.
 */
export interface StatementUploadResponse {
  /** Unique statement upload tracking receipt ID (e.g., 'stmt_upl_...') */
  upload_id: string;
  /** Authenticated user ID */
  user_id: number;
  /** Original filename stored and acknowledged by backend */
  filename: string;
  /** MIME type verified by backend */
  content_type: string;
  /** Verified size in bytes */
  size_bytes: number;
  /** Upload status ('RECEIVED') */
  status: string;
  /** Human-readable status confirmation message */
  message: string;
  /** ISO 8601 UTC timestamp of upload */
  uploaded_at: string;

  // -- Personalized transaction-pattern engine fields (new) -----------
  /** How many transaction rows were successfully parsed from the file. */
  parsed_rows?: number;
  /** How many of those parsed rows were new (not already stored). */
  inserted_rows?: number;
  /** How many were already-seen duplicates, skipped. */
  duplicate_rows?: number;
  /** "table" (pdfplumber found a structured table) or "ocr_fallback"
   *  (text/OCR extraction + line-based parsing — see
   *  statement_parser_service.py's OCR FALLBACK docstring note). */
  parse_method?: "table" | "ocr_fallback";
  /** Whether this upload triggered an immediate bootstrap training run
   *  (a user's very first statement upload — see
   *  user_pattern_trainer.py). */
  trained?: boolean;
  /** Personalized baseline percentiles, once trained (null until enough
   *  history exists). */
  p50_amount?: number | null;
  p90_amount?: number | null;
  p99_amount?: number | null;
}

/**
 * Classification of statement upload errors.
 */
export type StatementUploadErrorType =
  | "AUTH_FAILURE"        // 401 Unauthorized / missing / expired token
  | "NETWORK_FAILURE"     // Network disconnect / timeout / server unreachable
  | "SERVER_VALIDATION"   // 400 Bad Request / unsupported format / empty or oversized file
  | "SERVER_ERROR"        // 500+ Internal server error
  | "CANCELLED"           // Upload cancelled before or during flight
  | "UNKNOWN_ERROR";      // Uncategorized runtime failure

/**
 * Strongly typed error details for statement upload failures.
 */
export interface StatementUploadError {
  type: StatementUploadErrorType;
  message: string;
  statusCode?: number;
  details?: any;
}

/**
 * Discriminated union outcome of a statement upload operation.
 */
export type StatementUploadResult =
  | { success: true; data: StatementUploadResponse }
  | { success: false; error: StatementUploadError };

/**
 * Processing lifecycle statuses for an uploaded statement.
 */
export type StatementProcessingStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

/**
 * Response model returned by GET /api/v1/statements/{upload_id}/status.
 */
export interface StatementStatusResponse {
  /** Unique statement upload tracking receipt ID */
  upload_id: string;
  /** Authenticated user ID who owns the statement */
  user_id: number;
  /** Original filename of the statement */
  filename: string;
  /** Current processing status */
  status: StatementProcessingStatus;
  /** Human-readable status description */
  message: string;
  /** ISO 8601 UTC timestamp of initial upload */
  created_at: string;
  /** ISO 8601 UTC timestamp of last status transition */
  updated_at: string;
  /** Error detail if status is FAILED */
  error_detail?: string | null;
}

/**
 * Discriminated union outcome of a statement processing status query.
 */
export type StatementStatusResult =
  | { success: true; data: StatementStatusResponse }
  | { success: false; error: StatementUploadError };

/**
 * Text content extracted from an individual page of a bank statement.
 */
export interface StatementPageText {
  /** 1-indexed page number within the document */
  page_number: number;
  /** Raw text extracted from this page */
  text: string;
  /** Total characters extracted from this page */
  char_count: number;
}

/**
 * Technical and structural metadata for an extracted document.
 */
export interface StatementDocumentMetadata {
  /** Document MIME or format type */
  format: string;
  /** Total pages or images in the document */
  page_count: number;
  /** Total characters extracted across all pages */
  total_characters: number;
  /** ISO 8601 UTC timestamp of extraction */
  extracted_at: string;
  /** Original file size in bytes */
  file_size_bytes: number;
}

/**
 * Response model returned by POST /api/v1/statements/{upload_id}/extract
 * and GET /api/v1/statements/{upload_id}/extraction.
 */
export interface StatementExtractionResponse {
  /** Unique statement upload tracking receipt ID */
  upload_id: string;
  /** Processing status (COMPLETED or FAILED) */
  status: StatementProcessingStatus;
  /** Aggregated raw document text preserving page boundaries */
  raw_text: string;
  /** Per-page extracted text chunks */
  pages: StatementPageText[];
  /** Total number of pages processed */
  total_pages: number;
  /** Total number of characters extracted */
  total_characters: number;
  /** Document metadata */
  document_metadata?: StatementDocumentMetadata | null;
  /** Human-readable extraction summary */
  message: string;
  /** Error details if extraction failed */
  error_detail?: string | null;
}

/**
 * Discriminated union outcome of a statement extraction trigger or query.
 */
export type StatementExtractionResult =
  | { success: true; data: StatementExtractionResponse }
  | { success: false; error: StatementUploadError };

/**
 * Health and availability diagnostics for the backend statement OCR engine.
 */
export interface StatementOCRStatusResponse {
  /** Whether a local OCR engine binary is available */
  available: boolean;
  /** Primary OCR engine name */
  engine: string;
  /** Resolved OCR engine version */
  version?: string | null;
  /** Resolved binary path on backend host */
  binary_path?: string | null;
  /** Supported document formats */
  supported_formats: string[];
  /** Summary message and operational instructions */
  message: string;
  /** Platform install instructions if unavailable */
  install_instructions?: Record<string, string> | null;
}

/**
 * Discriminated union outcome of an OCR engine availability query.
 */
export type StatementOCRStatusResult =
  | { success: true; data: StatementOCRStatusResponse }
  | { success: false; error: StatementUploadError };
