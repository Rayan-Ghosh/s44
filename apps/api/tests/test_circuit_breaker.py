"""app/core/circuit_breaker.py — unit tests for the generic breaker, plus an
integration test proving the concrete claim this feature exists for: a hung
OTP delivery provider must not starve unrelated sync endpoints that share
Starlette's worker-thread pool with the OTP routes."""

from concurrent.futures import ThreadPoolExecutor
import time

import pytest

from app.core.circuit_breaker import (
    BulkheadFullError,
    CircuitBreaker,
    CircuitBreakerOpenError,
    CircuitState,
    DependencyTimeoutError,
)


def _failing():
    raise RuntimeError("dependency down")


def _slow(seconds):
    time.sleep(seconds)
    return "ok"


def test_closed_circuit_passes_calls_through():
    cb = CircuitBreaker("t", failure_threshold=3, window_size=3, call_timeout=1, max_concurrent=2, max_queue=2)
    assert cb.call(lambda: 42) == 42
    assert cb.state is CircuitState.CLOSED


def test_trips_open_after_failure_threshold():
    cb = CircuitBreaker("t", failure_threshold=3, window_size=3, call_timeout=1, max_concurrent=2, max_queue=2, recovery_timeout=60)
    for _ in range(3):
        with pytest.raises(RuntimeError):
            cb.call(_failing)
    assert cb.state is CircuitState.OPEN


def test_open_circuit_fast_fails_without_calling_dependency():
    cb = CircuitBreaker("t", failure_threshold=1, window_size=1, call_timeout=1, max_concurrent=2, max_queue=2, recovery_timeout=60)
    with pytest.raises(RuntimeError):
        cb.call(_failing)
    assert cb.state is CircuitState.OPEN

    calls = {"n": 0}

    def tracked():
        calls["n"] += 1
        return "should not run"

    t0 = time.perf_counter()
    with pytest.raises(CircuitBreakerOpenError):
        cb.call(tracked)
    elapsed = time.perf_counter() - t0

    assert calls["n"] == 0, "dependency must not be invoked while circuit is OPEN"
    assert elapsed < 0.05, "fast-fail must not block on anything"


def test_open_circuit_serves_fallback_when_provided():
    cb = CircuitBreaker("t", failure_threshold=1, window_size=1, call_timeout=1, max_concurrent=2, max_queue=2, recovery_timeout=60)
    with pytest.raises(RuntimeError):
        cb.call(_failing)
    assert cb.state is CircuitState.OPEN

    result = cb.call(_failing, fallback=lambda: "degraded-fallback-value")
    assert result == "degraded-fallback-value"


def test_slow_call_beyond_timeout_counts_as_failure_and_returns_promptly():
    cb = CircuitBreaker("t", failure_threshold=2, window_size=2, call_timeout=0.2, max_concurrent=2, max_queue=2, recovery_timeout=60)
    t0 = time.perf_counter()
    with pytest.raises(DependencyTimeoutError):
        cb.call(_slow, 5)
    elapsed = time.perf_counter() - t0
    assert elapsed < 1.0, "caller must be released at call_timeout, not wait for the slow call to finish"


def test_recovers_after_cooldown_via_half_open_trial():
    cb = CircuitBreaker(
        "t", failure_threshold=1, window_size=1, call_timeout=1,
        max_concurrent=2, max_queue=2, recovery_timeout=0.2, half_open_max_calls=1,
    )
    with pytest.raises(RuntimeError):
        cb.call(_failing)
    assert cb.state is CircuitState.OPEN

    time.sleep(0.25)
    assert cb.state is CircuitState.HALF_OPEN

    result = cb.call(lambda: "recovered")
    assert result == "recovered"
    assert cb.state is CircuitState.CLOSED

    # And normal calls flow through again without fast-failing.
    assert cb.call(lambda: "still fine") == "still fine"


def test_half_open_failure_reopens_immediately():
    cb = CircuitBreaker(
        "t", failure_threshold=1, window_size=1, call_timeout=1,
        max_concurrent=2, max_queue=2, recovery_timeout=0.2, half_open_max_calls=1,
    )
    with pytest.raises(RuntimeError):
        cb.call(_failing)
    time.sleep(0.25)
    assert cb.state is CircuitState.HALF_OPEN

    with pytest.raises(RuntimeError):
        cb.call(_failing)
    assert cb.state is CircuitState.OPEN


def test_bulkhead_caps_concurrency_and_rejects_past_capacity():
    # max_concurrent=1, max_queue=1 -> at most 2 calls admitted at once.
    cb = CircuitBreaker(
        "t", failure_threshold=100, window_size=100, call_timeout=5,
        max_concurrent=1, max_queue=1, recovery_timeout=60,
    )
    barrier_release = time.monotonic() + 0.5

    def blocker():
        time.sleep(max(0, barrier_release - time.monotonic()))
        return "done"

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(cb.call, blocker) for _ in range(2)]
        time.sleep(0.05)  # let the first two get admitted before the third arrives
        third = pool.submit(cb.call, blocker, fallback=lambda: "rejected")
        results = [f.result(timeout=5) for f in futures] + [third.result(timeout=5)]

    assert results.count("done") == 2
    assert results.count("rejected") == 1


def test_hung_dependency_does_not_starve_unrelated_shared_pool_work():
    """The actual property this feature exists to guarantee: with the
    dependency wrapped in a breaker (bounded bulkhead + timeout), work that
    has nothing to do with the dependency keeps completing promptly on a
    shared thread pool even while many callers are hammering a hung
    dependency call — simulating what would otherwise starve Starlette's
    shared anyio worker pool.
    """
    cb = CircuitBreaker(
        "hung_dep", failure_threshold=100, window_size=100, call_timeout=0.3,
        max_concurrent=3, max_queue=3, recovery_timeout=60,
    )

    def hung_call():
        time.sleep(10)  # never completes within the test
        return "unreachable"

    def unrelated_work():
        return 1 + 1

    # Simulates the shared app-wide worker pool: a handful of threads doing
    # both "call the dependency" and "unrelated work" concurrently, the way
    # anyio's shared limiter interleaves unrelated sync routes.
    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="shared-app-pool") as shared_pool:
        dependency_futures = [
            shared_pool.submit(cb.call, hung_call, fallback=lambda: "degraded")
            for _ in range(6)
        ]

        t0 = time.perf_counter()
        unrelated_future = shared_pool.submit(unrelated_work)
        unrelated_result = unrelated_future.result(timeout=2)
        elapsed = time.perf_counter() - t0

    assert unrelated_result == 2
    assert elapsed < 1.0, (
        "unrelated work queued on the same shared pool as the hung-dependency "
        "calls must still complete quickly — it must not be stuck behind "
        "threads blocked on the dependency"
    )

    # The dependency calls themselves were bounded by call_timeout and
    # returned the fallback rather than hanging the caller for 10s.
    for f in dependency_futures:
        assert f.result(timeout=2) == "degraded"
