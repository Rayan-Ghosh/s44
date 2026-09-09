"""
/api/v1/users/{user_id}/... — personalized transaction-pattern engine.

Predictions run on-device (see apps/mobile/src/services/
user-pattern-service.ts); this router's job is only training orchestration
and artifact distribution, never scoring a live payment itself. Nothing
here is wired into /api/v1/risk/evaluate's authoritative decision — see
user-pattern-service.ts's docstring for that boundary.
"""

import json

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core.concurrency import STATEMENT_SEMAPHORE, try_acquire
from app.core.config import BASE_DIR, settings
from app.core.database import get_db
from app.repositories import user_pattern_repository
from app.services.statement_parser_service import StatementParseError, ingest_statement

router = APIRouter(prefix="/api/v1/users", tags=["financial-profile"])


@router.post("/{user_id}/statement/upload")
async def upload_statement(
    user_id: int,
    file: UploadFile = File(...),
    password: str | None = Form(None),
    db: Session = Depends(get_db),
) -> dict:
    content = await file.read()
    if len(content) > settings.statement_upload_max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Statement exceeds the {settings.statement_upload_max_bytes // (1024 * 1024)}MB limit.",
        )

    acquired = await try_acquire(STATEMENT_SEMAPHORE)
    if not acquired:
        raise HTTPException(
            status_code=429,
            detail="Too many statement uploads in progress. Please try again shortly.",
        )
    try:
        try:
            return await ingest_statement(db, user_id, content, password)
        except StatementParseError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not parse this PDF (wrong password, or an unrecognized format): {exc}",
            ) from exc
    finally:
        STATEMENT_SEMAPHORE.release()


@router.get("/{user_id}/model-sync")
def model_sync(
    user_id: int,
    if_none_match: str | None = Header(None),
    db: Session = Depends(get_db),
) -> Response:
    profile = user_pattern_repository.get_or_create_profile(db, user_id)
    user_pattern_repository.touch_last_active(db, profile)

    artifact = user_pattern_repository.get_active_artifact(db, user_id)
    if artifact is None:
        return Response(
            content=json.dumps({"user_id": user_id, "has_model": False}),
            media_type="application/json",
        )

    if if_none_match and if_none_match.strip('"') == artifact.sha256_checksum:
        return Response(status_code=304)

    # Sidecar metadata (baseline percentiles +, for an onnx artifact, the
    # bundled elevated-score threshold — see user_pattern_trainer.py's
    # _write_and_record_artifact) is embedded here so the client gets
    # everything it needs to predict in ONE round trip; it only has to
    # download the artifact file itself (.onnx or .json) when the
    # checksum actually changed.
    metadata: dict = {}
    metadata_path = (BASE_DIR / artifact.artifact_path).with_suffix("").with_suffix(".metadata.json")
    if metadata_path.is_file():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    return Response(
        content=json.dumps(
            {
                "user_id": user_id,
                "has_model": True,
                "kind": artifact.kind,
                "latest_version": artifact.version,
                "sha256_checksum": artifact.sha256_checksum,
                "file_size_bytes": artifact.file_size_bytes,
                "download_url": f"/api/v1/users/{user_id}/model-artifact/{artifact.version}",
                **metadata,
            }
        ),
        media_type="application/json",
        headers={"ETag": f'"{artifact.sha256_checksum}"'},
    )


@router.get("/{user_id}/model-artifact/{version}")
def download_model_artifact(user_id: int, version: str, db: Session = Depends(get_db)) -> FileResponse:
    artifact = user_pattern_repository.get_artifact_by_version(db, user_id, version)
    if artifact is None:
        raise HTTPException(status_code=404, detail="No such artifact version for this user.")

    file_path = BASE_DIR / artifact.artifact_path
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact file missing on disk.")

    media_type = "application/octet-stream" if artifact.kind == "onnx" else "application/json"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={
            "Cache-Control": "private, max-age=86400",
            "ETag": f'"{artifact.sha256_checksum}"',
        },
    )
