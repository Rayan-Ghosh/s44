"""
Rate Limit Service — Pluggable architecture for login brute-force protection,
progressive lockouts, timing-safe anti-enumeration, and endpoint request rate limiting.
"""

from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
import math
from typing import Optional, Tuple
from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_identifier
from app.models.auth_rate_limit import AuthRateLimit


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def extract_client_ip(request: Optional[Request]) -> str:
    """
    Safely extracts client IP.
    Does not blindly trust X-Forwarded-For unless configured in a trusted proxy environment.
    """
    if request is None:
        return "127.0.0.1"

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Extract the leftmost non-empty client IP
        ips = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
        if ips:
            return ips[0]

    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


class BaseRateLimitBackend(ABC):
    @abstractmethod
    def check_login_rate_limit(
        self, db: Session, identifier: str, client_ip: str
    ) -> Tuple[bool, int, Optional[str]]:
        pass

    @abstractmethod
    def record_login_failure(
        self, db: Session, identifier: str, client_ip: str
    ) -> Tuple[bool, int]:
        pass

    @abstractmethod
    def record_login_success(
        self, db: Session, identifier: str
    ) -> None:
        pass

    @abstractmethod
    def check_and_record_endpoint_rate_limit(
        self, db: Session, endpoint_name: str, client_ip: str, max_requests: int, window_seconds: int
    ) -> Tuple[bool, int, Optional[str]]:
        pass


class SqlAlchemyRateLimitBackend(BaseRateLimitBackend):
    def _normalize_and_hash(self, raw_key: str) -> str:
        clean = raw_key.strip().lower()
        return hash_identifier(clean)

    def _calculate_lockout_duration(self, lockout_count: int) -> int:
        base = settings.auth_base_lockout_seconds
        multiplier = settings.auth_progressive_lockout_multiplier
        max_duration = settings.auth_max_lockout_seconds

        calculated = int(base * math.pow(multiplier, max(0, lockout_count)))
        return min(calculated, max_duration)

    def check_login_rate_limit(
        self, db: Session, identifier: str, client_ip: str
    ) -> Tuple[bool, int, Optional[str]]:
        now = datetime.now(timezone.utc)
        acct_hash = self._normalize_and_hash(identifier)
        ip_hash = self._normalize_and_hash(client_ip)

        # 1. Check account-level lockout
        acct_record = (
            db.query(AuthRateLimit)
            .filter_by(key_hash=acct_hash, key_type="ACCOUNT")
            .first()
        )
        if acct_record and acct_record.locked_until:
            locked_utc = _as_utc(acct_record.locked_until)
            if locked_utc > now:
                retry_after = max(1, int((locked_utc - now).total_seconds()))
                return False, retry_after, f"Too many failed login attempts. Please try again in {math.ceil(retry_after / 60)} minutes."

        # 2. Check IP-level lockout
        ip_record = (
            db.query(AuthRateLimit)
            .filter_by(key_hash=ip_hash, key_type="IP")
            .first()
        )
        if ip_record and ip_record.locked_until:
            locked_utc = _as_utc(ip_record.locked_until)
            if locked_utc > now:
                retry_after = max(1, int((locked_utc - now).total_seconds()))
                return False, retry_after, f"Too many requests from your network. Please try again in {math.ceil(retry_after / 60)} minutes."

        return True, 0, None

    def record_login_failure(
        self, db: Session, identifier: str, client_ip: str
    ) -> Tuple[bool, int]:
        """
        Atomically records failed attempt under account hash and IP hash.
        Applies progressive lockout if attempt window threshold is reached.
        Returns: (is_locked_now, retry_after_seconds)
        """
        now = datetime.now(timezone.utc)
        acct_hash = self._normalize_and_hash(identifier)
        ip_hash = self._normalize_and_hash(client_ip)

        window = timedelta(seconds=settings.auth_attempt_window_seconds)
        history_decay = timedelta(days=settings.auth_abuse_history_reset_days)

        # Update Account Record
        acct_record = (
            db.query(AuthRateLimit)
            .filter_by(key_hash=acct_hash, key_type="ACCOUNT")
            .with_for_update(nowait=False) if db.bind and db.bind.dialect.name != "sqlite"
            else db.query(AuthRateLimit).filter_by(key_hash=acct_hash, key_type="ACCOUNT")
        ).first()

        is_locked = False
        retry_seconds = 0

        if not acct_record:
            acct_record = AuthRateLimit(
                key_hash=acct_hash,
                key_type="ACCOUNT",
                failed_attempts=1,
                request_count=1,
                first_seen_at=now,
                last_attempt_at=now,
                lockout_count=0,
                updated_at=now,
            )
            db.add(acct_record)
        else:
            # Check abuse history decay
            last_attempt_utc = _as_utc(acct_record.last_attempt_at)
            if (now - last_attempt_utc) > history_decay:
                acct_record.lockout_count = 0

            first_seen_utc = _as_utc(acct_record.first_seen_at)
            if (now - first_seen_utc) > window and (not acct_record.locked_until or _as_utc(acct_record.locked_until) <= now):
                # Reset window
                acct_record.failed_attempts = 1
                acct_record.first_seen_at = now
            else:
                acct_record.failed_attempts += 1

            acct_record.last_attempt_at = now
            acct_record.request_count += 1
            acct_record.updated_at = now

            if acct_record.failed_attempts >= settings.auth_max_failed_attempts:
                lockout_duration = self._calculate_lockout_duration(acct_record.lockout_count)
                acct_record.locked_until = now + timedelta(seconds=lockout_duration)
                acct_record.lockout_count += 1
                acct_record.failed_attempts = 0
                is_locked = True
                retry_seconds = lockout_duration

        # Update IP Record (IP abuse counter)
        ip_record = (
            db.query(AuthRateLimit)
            .filter_by(key_hash=ip_hash, key_type="IP")
            .first()
        )
        if not ip_record:
            ip_record = AuthRateLimit(
                key_hash=ip_hash,
                key_type="IP",
                failed_attempts=1,
                request_count=1,
                first_seen_at=now,
                last_attempt_at=now,
                lockout_count=0,
                updated_at=now,
            )
            db.add(ip_record)
        else:
            first_seen_utc = _as_utc(ip_record.first_seen_at)
            if (now - first_seen_utc) > window:
                ip_record.failed_attempts = 1
                ip_record.first_seen_at = now
            else:
                ip_record.failed_attempts += 1

            ip_record.last_attempt_at = now
            ip_record.request_count += 1
            ip_record.updated_at = now

            if ip_record.failed_attempts >= settings.auth_ip_max_attempts:
                ip_lockout = settings.auth_base_lockout_seconds
                ip_record.locked_until = now + timedelta(seconds=ip_lockout)
                ip_record.failed_attempts = 0
                is_locked = True
                retry_seconds = max(retry_seconds, ip_lockout)

        db.commit()
        return is_locked, retry_seconds

    def record_login_success(
        self, db: Session, identifier: str
    ) -> None:
        """
        Resets ONLY the account-level failure counter.
        IP-level abuse counters are preserved to prevent attackers from clearing IP limits.
        """
        now = datetime.now(timezone.utc)
        acct_hash = self._normalize_and_hash(identifier)

        acct_record = (
            db.query(AuthRateLimit)
            .filter_by(key_hash=acct_hash, key_type="ACCOUNT")
            .first()
        )
        if acct_record:
            acct_record.failed_attempts = 0
            acct_record.locked_until = None
            acct_record.updated_at = now
            db.commit()

    def check_and_record_endpoint_rate_limit(
        self, db: Session, endpoint_name: str, client_ip: str, max_requests: int, window_seconds: int
    ) -> Tuple[bool, int, Optional[str]]:
        now = datetime.now(timezone.utc)
        composite_key = f"{endpoint_name}:{client_ip}"
        key_hash = self._normalize_and_hash(composite_key)

        record = (
            db.query(AuthRateLimit)
            .filter_by(key_hash=key_hash, key_type="ENDPOINT")
            .first()
        )

        window = timedelta(seconds=window_seconds)

        if not record:
            record = AuthRateLimit(
                key_hash=key_hash,
                key_type="ENDPOINT",
                failed_attempts=0,
                request_count=1,
                first_seen_at=now,
                last_attempt_at=now,
                updated_at=now,
            )
            db.add(record)
            db.commit()
            return True, 0, None

        first_seen_utc = _as_utc(record.first_seen_at)
        elapsed = (now - first_seen_utc).total_seconds()

        if elapsed > window_seconds:
            # Window expired, reset counter
            record.request_count = 1
            record.first_seen_at = now
            record.last_attempt_at = now
            record.locked_until = None
            record.updated_at = now
            db.commit()
            return True, 0, None

        record.request_count += 1
        record.last_attempt_at = now
        record.updated_at = now

        if record.request_count > max_requests:
            retry_after = max(1, int(window_seconds - elapsed))
            record.locked_until = now + timedelta(seconds=retry_after)
            db.commit()
            return False, retry_after, f"Rate limit exceeded for this action. Please retry in {retry_after} seconds."

        db.commit()
        return True, 0, None


# Global rate limiter instance delegating to backend
_backend: BaseRateLimitBackend = SqlAlchemyRateLimitBackend()


class RateLimitService:
    @classmethod
    def check_login_rate_limit(
        cls, db: Session, identifier: str, client_ip: str
    ) -> Tuple[bool, int, Optional[str]]:
        return _backend.check_login_rate_limit(db, identifier, client_ip)

    @classmethod
    def record_login_failure(
        cls, db: Session, identifier: str, client_ip: str
    ) -> Tuple[bool, int]:
        return _backend.record_login_failure(db, identifier, client_ip)

    @classmethod
    def record_login_success(
        cls, db: Session, identifier: str
    ) -> None:
        _backend.record_login_success(db, identifier)

    @classmethod
    def check_and_record_endpoint_rate_limit(
        cls, db: Session, endpoint_name: str, client_ip: str, max_requests: int, window_seconds: int
    ) -> Tuple[bool, int, Optional[str]]:
        return _backend.check_and_record_endpoint_rate_limit(
            db, endpoint_name, client_ip, max_requests, window_seconds
        )
