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

    # Prototype-only pepper for hashing sensitive identifiers (see
    # app/core/security.py). The default below is intentionally obvious
    # and MUST be overridden via .env for anything beyond local dev — see
    # docs/SECURITY.md's open item on hashing/key management.
    hash_pepper: str = "s40-dev-only-pepper-change-me"

    # Symmetric key for app/core/contact_encryption.py (Fernet). Guards the
    # one place raw, reversible contact info (email/phone) is allowed to
    # live — see docs/PROFILE_CONTACT_INFO_DECISION.md. This dev default is
    # a real, valid Fernet key (so the app boots out of the box) but is
    # checked into source, so it is NOT secret — generate and set a real
    # one via .env for anything beyond local dev:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    contact_info_encryption_key: str = "_SiZeLTNC9qRCBhjjnil3lbCAYqQYDheLL-DYZ0fq1g="

    # Authentication & JWT Configuration
    jwt_secret_key: str = "s40-dev-insecure-jwt-secret-key-change-in-production-1234567890"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    max_failed_login_attempts: int = 5
    account_lockout_minutes: int = 15


settings = Settings()
