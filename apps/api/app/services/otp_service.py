"""
OTP Generation, Cryptographic Hashing, Verification & Delivery Services.

Separates concerns into:
1. Cryptographically secure 6-digit numeric generation (CSPRNG).
2. Salted HMAC-SHA256 hashing & constant-time verification.
3. Contact PII masking.
4. Pluggable OTP Delivery Provider Interface (isolated from auth flow).
"""

from abc import ABC, abstractmethod
from datetime import datetime, timezone
import hashlib
import hmac
import logging
import os
import re
import secrets
from typing import Any, Optional

from app.core.circuit_breaker import CircuitBreaker
from app.core.config import settings

logger = logging.getLogger(__name__)


def generate_secure_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP of given length (default 6 digits)."""
    # Uses system CSPRNG (secrets module)
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_otp(otp: str) -> str:
    """Hash an OTP securely using HMAC-SHA256 with random salt and pepper.
    Returns: <salt_hex>:<hmac_hex>
    """
    if not otp:
        raise ValueError("Cannot hash an empty OTP.")
    salt = os.urandom(16)
    key = settings.hash_pepper.encode("utf-8")
    payload = f"{salt.hex()}:{otp}".encode("utf-8")
    mac = hmac.new(key, payload, hashlib.sha256).hexdigest()
    return f"{salt.hex()}:{mac}"


def verify_otp(plain_otp: str, stored_hash: str) -> bool:
    """Constant-time verification of a plain numeric OTP against a stored hash."""
    if not plain_otp or not stored_hash or ":" not in stored_hash:
        return False
    try:
        salt_hex, expected_mac = stored_hash.split(":", 1)
        key = settings.hash_pepper.encode("utf-8")
        payload = f"{salt_hex}:{plain_otp.strip()}".encode("utf-8")
        actual_mac = hmac.new(key, payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(actual_mac, expected_mac)
    except Exception:
        return False


def mask_contact(identifier: str) -> str:
    """Format contact identifier into a safe masked string for user display.
    Examples:
    - Phone: "+91 98765 43210" -> "+91 ******3210"
    - Email: "rahul@example.com" -> "r***@example.com"
    """
    if not identifier:
        return "registered contact"

    clean = identifier.strip()

    if "@" in clean:
        parts = clean.split("@", 1)
        name = parts[0]
        domain = parts[1]
        if len(name) <= 2:
            masked_name = name[0] + "***"
        else:
            masked_name = name[0] + "***" + name[-1]
        return f"{masked_name}@{domain}"

    # Phone number masking
    digits_only = re.sub(r"[^\d+]", "", clean)
    if len(digits_only) >= 10:
        last4 = digits_only[-4:]
        prefix = digits_only[:3] if digits_only.startswith("+") else "+91"
        return f"{prefix} ******{last4}"
    elif len(clean) > 4:
        return f"******{clean[-4:]}"
    return "******"


# =====================================================================
# Pluggable OTP Delivery Provider Interface & Implementations
# =====================================================================

class BaseOtpDeliveryProvider(ABC):
    """Abstract interface for OTP delivery (SMS, Email, Push)."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Identifier for the delivery provider implementation."""
        pass

    @property
    @abstractmethod
    def is_live_provider(self) -> bool:
        """Returns True if this provider dispatches real SMS/Email messages via a live gateway."""
        pass

    @abstractmethod
    def send_otp(self, target: str, otp: str, purpose: str = "ACCOUNT_VERIFICATION") -> bool:
        """Send the OTP to the target recipient. Return True on successful dispatch."""
        pass


class MockOtpDeliveryProvider(BaseOtpDeliveryProvider):
    """In-memory mock provider for automated unit tests and local sandbox environments.
    Does not connect to external networks. Never logs OTPs in production.
    """

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def is_live_provider(self) -> bool:
        return False

    def __init__(self):
        self._dispatched = []

    def send_otp(self, target: str, otp: str, purpose: str = "ACCOUNT_VERIFICATION") -> bool:
        masked = mask_contact(target)
        self._dispatched.append({
            "target": target,
            "masked_target": masked,
            "purpose": purpose,
            "timestamp": datetime.now(timezone.utc),
            "_test_otp": otp,
        })
        if settings.environment != "production":
            logger.debug(f"[MockOtpDelivery] Generated OTP for {masked} (purpose: {purpose})")
        return True

    def get_last_otp_for_target(self, target: str) -> Optional[str]:
        """Internal test helper to inspect dispatched codes during automated test execution."""
        for item in reversed(self._dispatched):
            if item["target"] == target:
                return item["_test_otp"]
        return None


class ConsoleOtpDeliveryProvider(BaseOtpDeliveryProvider):
    """Local development console provider. Prints to local developer terminal in dev mode only."""

    @property
    def provider_name(self) -> str:
        return "console"

    @property
    def is_live_provider(self) -> bool:
        return False

    def send_otp(self, target: str, otp: str, purpose: str = "ACCOUNT_VERIFICATION") -> bool:
        masked = mask_contact(target)
        if settings.environment != "production":
            print(f"\n[DEV OTP DISPATCH] Target: {masked} | Purpose: {purpose} | Code: {otp}\n")
        return True


class NullOtpDeliveryProvider(BaseOtpDeliveryProvider):
    """Safe no-op delivery provider when no delivery gateway is configured."""

    @property
    def provider_name(self) -> str:
        return "null"

    @property
    def is_live_provider(self) -> bool:
        return False

    def send_otp(self, target: str, otp: str, purpose: str = "ACCOUNT_VERIFICATION") -> bool:
        masked = mask_contact(target)
        logger.warning(f"[NullOtpDelivery] No real SMS/Email delivery provider configured for {masked}.")
        return False


def get_otp_delivery_provider() -> BaseOtpDeliveryProvider:
    """Factory creating the configured OTP delivery provider based on settings."""
    provider_type = (settings.otp_delivery_provider or "mock").lower()
    if provider_type == "console":
        return ConsoleOtpDeliveryProvider()
    elif provider_type in ("none", "null"):
        return NullOtpDeliveryProvider()
    # Default to Mock provider for local development & test suite
    return MockOtpDeliveryProvider()


class CircuitBreakerProtectedOtpProvider(BaseOtpDeliveryProvider):
    """Wraps another BaseOtpDeliveryProvider's send_otp with a circuit
    breaker + bulkhead + timeout (app/core/circuit_breaker.py).

    Every call site in app/api/routers/auth.py calls
    `otp_delivery_provider.send_otp(...)` directly from a synchronous route
    handler with no try/except around it and no timeout — those routes run
    on the shared anyio worker-thread pool used by every other sync endpoint
    in the app. Without this wrapper, a hung live delivery gateway would
    hold that shared thread indefinitely per request, and enough concurrent
    OTP requests would starve the pool for unrelated endpoints (guardian,
    payments, transactions...) too.

    No fallback is registered here deliberately: OTP delivery is a
    safety-relevant action, so a failed/open circuit re-raises
    (CircuitBreakerOpenError, DependencyTimeoutError, or the provider's own
    exception) rather than silently reporting a fabricated "delivered"
    result. Callers already run inside FastAPI's normal exception handling,
    so this surfaces as a 500 exactly as an uncaught provider exception
    already would have before this wrapper existed — the change is that the
    failure is now bounded (call_timeout) and fast (once OPEN) instead of
    hanging a shared thread on every single request.
    """

    def __init__(self, delegate: BaseOtpDeliveryProvider, breaker: CircuitBreaker) -> None:
        self._delegate = delegate
        self._breaker = breaker

    @property
    def provider_name(self) -> str:
        return self._delegate.provider_name

    @property
    def is_live_provider(self) -> bool:
        return self._delegate.is_live_provider

    def send_otp(self, target: str, otp: str, purpose: str = "ACCOUNT_VERIFICATION") -> bool:
        return self._breaker.call(self._delegate.send_otp, target, otp, purpose)

    def __getattr__(self, item: str) -> Any:
        # Transparent passthrough for provider-specific extras that aren't
        # part of BaseOtpDeliveryProvider — e.g. MockOtpDeliveryProvider's
        # get_last_otp_for_target(), used directly by the test suite.
        return getattr(self._delegate, item)


otp_delivery_breaker = CircuitBreaker(
    name="otp_delivery",
    failure_threshold=settings.otp_delivery_breaker_failure_threshold,
    window_size=settings.otp_delivery_breaker_window_size,
    recovery_timeout=settings.otp_delivery_breaker_recovery_timeout_seconds,
    call_timeout=settings.otp_delivery_breaker_call_timeout_seconds,
    max_concurrent=settings.otp_delivery_breaker_max_concurrent,
    max_queue=settings.otp_delivery_breaker_max_queue,
)

# Singleton delivery provider instance — every call site in auth.py goes
# through the circuit breaker, regardless of which underlying provider is
# configured.
otp_delivery_provider: BaseOtpDeliveryProvider = CircuitBreakerProtectedOtpProvider(
    get_otp_delivery_provider(), otp_delivery_breaker
)
