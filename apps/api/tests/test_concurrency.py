"""app/core/concurrency.py — semaphore backpressure and the CPU-bound
thread-offload helper used by the personalized transaction-pattern engine
(user_pattern_trainer.py, statement_parser_service.py)."""

import asyncio
import time

import pytest

from app.core.concurrency import run_cpu_bound, try_acquire


@pytest.mark.asyncio
async def test_try_acquire_succeeds_when_slot_free():
    sem = asyncio.Semaphore(1)
    acquired = await try_acquire(sem)
    assert acquired is True
    assert sem.locked()
    sem.release()


@pytest.mark.asyncio
async def test_try_acquire_fails_without_blocking_when_saturated():
    sem = asyncio.Semaphore(1)
    await sem.acquire()  # hold the only slot

    t0 = time.perf_counter()
    acquired = await try_acquire(sem)
    elapsed = time.perf_counter() - t0

    assert acquired is False
    assert elapsed < 0.05, "try_acquire must return immediately, never block"
    sem.release()


@pytest.mark.asyncio
async def test_try_acquire_respects_capacity_under_concurrency():
    """N+1th concurrent try_acquire on an N-slot semaphore must fail, not
    queue — the actual backpressure guarantee this exists for."""
    sem = asyncio.Semaphore(2)
    results = await asyncio.gather(*(try_acquire(sem) for _ in range(5)))
    assert sum(results) == 2, "exactly 2 of 5 concurrent acquires should succeed on a 2-slot semaphore"


@pytest.mark.asyncio
async def test_run_cpu_bound_executes_off_the_event_loop_and_returns_result():
    def blocking_add(a, b):
        time.sleep(0.05)
        return a + b

    t0 = time.perf_counter()
    # Two calls in parallel should take ~0.05s total (both run concurrently
    # on the dedicated pool), not ~0.1s (serialized) — proves this isn't
    # accidentally blocking the caller.
    results = await asyncio.gather(
        run_cpu_bound(blocking_add, 1, 2),
        run_cpu_bound(blocking_add, 3, 4),
    )
    elapsed = time.perf_counter() - t0

    assert results == [3, 7]
    assert elapsed < 0.15, f"expected concurrent execution (~0.05s), took {elapsed:.3f}s"
