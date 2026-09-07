"""
Generic circuit breaker + bulkhead for protecting the app against a slow or
failing external dependency.

Why this exists: every synchronous FastAPI route in this app (`def`, not
`async def` — see app/api/routers/auth.py etc.) is executed by Starlette via
`anyio.to_thread.run_sync`, which draws from a single shared worker-thread
pool for the *entire process* (default capacity 40 — see
starlette/concurrency.py). If a call inside one of those routes blocks on a
slow/hung external dependency with no bound on it, it holds one of those
shared threads for as long as the dependency hangs. Enough concurrent hung
calls exhaust the shared pool and every *unrelated* sync endpoint
(transactions, guardian, payments, risk) stops responding too — a single
flaky dependency cascades into a full outage.

The concrete case in this codebase: app/services/otp_service.py's pluggable
OTP delivery provider (BaseOtpDeliveryProvider.send_otp) is called directly,
synchronously, uncaught, from five call sites in app/api/routers/auth.py
(login resend, signup, OTP verify resend, password reset request, device
transfer). Today's providers (mock/console/null) return instantly, but
app/core/config.py's production validator already requires a live delivery
gateway (SMS/email) in production — the first live provider plugged in there
lands on exactly this call path with no protection.

This module provides that protection generically, with three parts:

1. Bulkhead: a small dedicated thread pool (not the shared app pool) that
   the dependency's calls run on, with a hard cap on in-flight + queued
   calls. A hung dependency can only ever tie up its own bulkhead threads,
   never the shared pool used by the rest of the app.
2. Timeout: the calling (shared-pool) thread waits at most `call_timeout`
   seconds for a result. If the bulkhead call hasn't finished by then, the
   caller gets control back immediately (the abandoned call keeps running in
   the isolated bulkhead until it eventually finishes or errors, but nothing
   in the shared pool is waiting on it any more).

   Caveat: Python cannot forcibly kill a running thread, so call_timeout
   only bounds how long the *caller* waits — it does not stop the abandoned
   call itself. If the wrapped function can hang indefinitely with no
   timeout of its own (e.g. a socket call with no connect/read timeout
   configured), enough abandoned calls will eventually occupy every
   max_concurrent bulkhead worker permanently, and the bulkhead stops
   admitting even HALF_OPEN recovery trials — no amount of circuit-breaker
   logic can free a thread stuck in an uninterruptible blocking call. The
   function passed to `call()` must therefore have its own bounded timeout
   (e.g. httpx's `timeout=`, a DB driver's statement/connect timeout) at or
   below `call_timeout`, so abandoned calls actually return and the
   bulkhead drains. This is a general limitation of thread-based circuit
   breakers in Python, not specific to this implementation.
3. Circuit breaker: tracks recent outcomes (success / failure / timeout) in
   a sliding window. Once failures cross `failure_threshold` within that
   window, the circuit trips OPEN and every subsequent call fast-fails (or
   runs `fallback`) for `recovery_timeout` seconds without touching the
   bulkhead or the dependency at all. After the cooldown it allows a bounded
   number of HALF_OPEN trial calls through; if they succeed the circuit
   closes and normal traffic resumes, if any fails it reopens immediately.

Deliberately dependency-free (stdlib only) rather than pulling in a third
-party breaker library — the state machine is small and this keeps it easy
to read, test, and reuse for the next external dependency this app adds.
"""

from __future__ import annotations

from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from dataclasses import dataclass, field
from enum import Enum
import logging
import threading
import time
from typing import Any, Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreakerOpenError(Exception):
    """Raised on a fast-failed call while the breaker is OPEN (or HALF_OPEN
    trial slots are full) and no fallback was supplied."""


class BulkheadFullError(Exception):
    """Raised when the dependency already has max_concurrent + max_queue
    calls in flight and no fallback was supplied. Distinct from
    CircuitBreakerOpenError so callers/metrics can tell "dependency is
    overloaded right now" from "dependency is confirmed down"."""


class DependencyTimeoutError(Exception):
    """Raised (wrapping no real exception — the call may still be running in
    the bulkhead) when a call does not complete within call_timeout."""


@dataclass
class _CallStats:
    total: int = 0
    successes: int = 0
    failures: int = 0
    rejections: int = 0  # bulkhead-full or circuit-open fast-fails
    last_state_change: float = field(default_factory=time.monotonic)


class CircuitBreaker:
    """Wraps calls to one external dependency with a bulkhead + timeout +
    circuit breaker. One instance per dependency — construct it once (module
    level, like otp_service.py does) and reuse it across requests.
    """

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = 5,
        window_size: int = 10,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 1,
        half_open_success_threshold: int = 1,
        call_timeout: float = 3.0,
        max_concurrent: int = 5,
        max_queue: int = 10,
    ) -> None:
        if failure_threshold < 1:
            raise ValueError("failure_threshold must be >= 1")
        if window_size < failure_threshold:
            raise ValueError("window_size must be >= failure_threshold")

        self.name = name
        self.failure_threshold = failure_threshold
        self.window_size = window_size
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.half_open_success_threshold = half_open_success_threshold
        self.call_timeout = call_timeout
        self.max_concurrent = max_concurrent
        self.max_queue = max_queue

        # Bulkhead: isolated pool so a hung dependency call can never consume
        # a thread from the shared app-wide pool.
        self._executor = ThreadPoolExecutor(
            max_workers=max_concurrent, thread_name_prefix=f"breaker-{name}"
        )

        self._lock = threading.Lock()
        self._state = CircuitState.CLOSED
        self._outcomes: deque[bool] = deque(maxlen=window_size)  # True=success
        self._opened_at: Optional[float] = None
        self._half_open_inflight = 0
        self._half_open_successes = 0
        self._inflight_and_queued = 0
        self.stats = _CallStats()

    # -- introspection -----------------------------------------------------

    @property
    def state(self) -> CircuitState:
        with self._lock:
            self._maybe_transition_to_half_open_locked()
            return self._state

    def reset(self) -> None:
        """Force the breaker back to CLOSED with a clean window. Intended
        for tests/ops tooling, not normal call-path use."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._outcomes.clear()
            self._opened_at = None
            self._half_open_inflight = 0
            self._half_open_successes = 0
            self.stats.last_state_change = time.monotonic()

    # -- state machine (all callers must hold self._lock) -------------------

    def _maybe_transition_to_half_open_locked(self) -> None:
        if self._state is CircuitState.OPEN and self._opened_at is not None:
            if time.monotonic() - self._opened_at >= self.recovery_timeout:
                self._state = CircuitState.HALF_OPEN
                self._half_open_inflight = 0
                self._half_open_successes = 0
                self.stats.last_state_change = time.monotonic()
                logger.info("CircuitBreaker[%s]: OPEN -> HALF_OPEN (recovery timeout elapsed, admitting trial calls)", self.name)

    def _trip_open_locked(self) -> None:
        if self._state is not CircuitState.OPEN:
            logger.warning(
                "CircuitBreaker[%s]: %s -> OPEN (%d/%d recent calls failed)",
                self.name, self._state.value, self._outcomes.count(False), len(self._outcomes),
            )
        self._state = CircuitState.OPEN
        self._opened_at = time.monotonic()
        self._outcomes.clear()
        self.stats.last_state_change = time.monotonic()

    def _close_locked(self) -> None:
        if self._state is not CircuitState.CLOSED:
            logger.info("CircuitBreaker[%s]: %s -> CLOSED (recovered)", self.name, self._state.value)
        self._state = CircuitState.CLOSED
        self._outcomes.clear()
        self._opened_at = None
        self._half_open_inflight = 0
        self._half_open_successes = 0
        self.stats.last_state_change = time.monotonic()

    def _record_outcome_locked(self, success: bool) -> None:
        self.stats.total += 1
        if success:
            self.stats.successes += 1
        else:
            self.stats.failures += 1

        if self._state is CircuitState.HALF_OPEN:
            if success:
                self._half_open_successes += 1
                if self._half_open_successes >= self.half_open_success_threshold:
                    self._close_locked()
            else:
                # Any failure during the trial immediately re-opens — the
                # dependency is not actually recovered.
                self._trip_open_locked()
            return

        # CLOSED
        self._outcomes.append(success)
        if not success and self._outcomes.count(False) >= self.failure_threshold:
            self._trip_open_locked()

    # -- the actual guarded call ---------------------------------------------

    def call(
        self,
        func: Callable[..., T],
        *args: Any,
        fallback: Optional[Callable[..., T]] = None,
        **kwargs: Any,
    ) -> T:
        """Run func(*args, **kwargs) through the bulkhead + timeout + circuit
        breaker.

        - If the circuit is OPEN (or HALF_OPEN trial slots are full): fast
          -fails without ever touching the dependency. Returns
          fallback(*args, **kwargs) if given, else raises
          CircuitBreakerOpenError.
        - If the bulkhead is already at max_concurrent + max_queue in-flight
          calls: same fallback-or-raise behavior, raising BulkheadFullError.
        - Otherwise submits func to the isolated bulkhead executor and waits
          up to call_timeout seconds. A timeout or an exception from func
          counts as a failure toward tripping the circuit; success resets
          progress toward closing it. On timeout/exception: same
          fallback-or-raise behavior (DependencyTimeoutError for timeouts,
          the original exception otherwise).
        """
        with self._lock:
            self._maybe_transition_to_half_open_locked()

            if self._state is CircuitState.OPEN:
                self.stats.rejections += 1
                return self._fallback_or_raise(
                    fallback, args, kwargs, CircuitBreakerOpenError(f"Circuit '{self.name}' is OPEN")
                )

            if self._state is CircuitState.HALF_OPEN:
                if self._half_open_inflight >= self.half_open_max_calls:
                    self.stats.rejections += 1
                    return self._fallback_or_raise(
                        fallback, args, kwargs,
                        CircuitBreakerOpenError(f"Circuit '{self.name}' is HALF_OPEN with trial slots full"),
                    )
                self._half_open_inflight += 1

            if self._inflight_and_queued >= self.max_concurrent + self.max_queue:
                if self._state is CircuitState.HALF_OPEN:
                    self._half_open_inflight -= 1
                self.stats.rejections += 1
                return self._fallback_or_raise(
                    fallback, args, kwargs,
                    BulkheadFullError(f"Dependency '{self.name}' has no free capacity ({self._inflight_and_queued} in flight/queued)"),
                )

            self._inflight_and_queued += 1
            was_half_open_trial = self._state is CircuitState.HALF_OPEN

        future: Future = self._executor.submit(func, *args, **kwargs)
        try:
            result = future.result(timeout=self.call_timeout)
        except FutureTimeoutError:
            with self._lock:
                self._inflight_and_queued -= 1
                if was_half_open_trial:
                    self._half_open_inflight -= 1
                self._record_outcome_locked(success=False)
            logger.warning("CircuitBreaker[%s]: call exceeded %.1fs timeout", self.name, self.call_timeout)
            return self._fallback_or_raise(
                fallback, args, kwargs,
                DependencyTimeoutError(f"Dependency '{self.name}' did not respond within {self.call_timeout}s"),
            )
        except Exception as exc:  # noqa: BLE001 - genuinely must catch anything func raises
            with self._lock:
                self._inflight_and_queued -= 1
                if was_half_open_trial:
                    self._half_open_inflight -= 1
                self._record_outcome_locked(success=False)
            return self._fallback_or_raise(fallback, args, kwargs, exc)
        else:
            with self._lock:
                self._inflight_and_queued -= 1
                if was_half_open_trial:
                    self._half_open_inflight -= 1
                self._record_outcome_locked(success=True)
            return result

    @staticmethod
    def _fallback_or_raise(
        fallback: Optional[Callable[..., T]],
        args: tuple,
        kwargs: dict,
        error: Exception,
    ) -> T:
        if fallback is not None:
            return fallback(*args, **kwargs)
        raise error

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)
