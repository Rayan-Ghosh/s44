"""
user_model_artifacts — versioned, per-user on-device inference artifacts.

Written by app/services/user_pattern_trainer.py after each retrain, served
by GET /api/v1/users/{user_id}/model-sync and .../model-artifact/{version}
(app/api/routers/financial_profile.py). Files live under
storage/models/users/{user_id}/ on local disk (gitignored, same convention
as Avaran.db) — small enough (<60KB) that no external object storage is
needed at this scale.

`kind` distinguishes the two artifact shapes a client may receive:
- "onnx": a fitted micro IsolationForest, run on-device via
  onnxruntime-react-native (mirrors apps/mobile/src/services/
  recipient-risk-service.ts's existing pattern).
- "quantile-json": a cold-start user (<30 transactions) — no model, just
  the three shrunk percentiles, compared arithmetically on-device. See
  ml/training/train_user_pattern.py for which path a given user gets.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserModelArtifact(Base):
    __tablename__ = "user_model_artifacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    version: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # "onnx" | "quantile-json"
    sha256_checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    artifact_path: Mapped[str] = mapped_column(String(255), nullable=False)

    # Only one active artifact per user at a time — prior rows get flipped
    # False by user_pattern_trainer.py on each successful retrain.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
