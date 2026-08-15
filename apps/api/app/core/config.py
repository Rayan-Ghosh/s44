"""
Application configuration.

Bootstrap-scope only: this scaffold reads a small set of settings needed to
start the API and connect to the local development database. It will grow
as later phases (risk engine, ML inference, voice, auth) add their own
settings — see docs/DEVELOPMENT_PLAN.md.

No secrets are hardcoded here. Values come from environment variables /
a local .env file, which is git-ignored (see .gitignore and .env.example).
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repository root: apps/api/app/core/config.py -> core -> app -> api -> apps -> <root>
BASE_DIR = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "S40 API"
    environment: str = "development"

    # Bootstrap database: SQLite file at the repository root, per the
    # project's decision to keep Avaran.db as a reproducible local
    # development database (see scripts/seed_database.py and
    # docs/SECURITY.md). Production deployment will use PostgreSQL per
    # the specification (spec §3, §18) — that migration is a later phase,
    # not decided or implemented here.
    database_url: str = f"sqlite:///{BASE_DIR / 'Avaran.db'}"


settings = Settings()
