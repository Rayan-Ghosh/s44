"""
Resource guardrails for the personalized transaction-pattern engine
(app/services/user_pattern_trainer.py, statement_parser_service.py).

Fitting a per-user model and parsing an uploaded PDF are both CPU-bound and
would block Starlette's shared sync-route thread pool if run inline (same
class of problem app/core/circuit_breaker.py's bulkhead solves for a slow
external dependency — here the "dependency" is CPU time, not a network
call). Two things bound that cost:

1. A dedicated worker pool (CPU_WORKER_POOL) so this work never competes
   with the shared pool used by every other endpoint.
2. Hard concurrency caps (the two semaphores below) so at most a few fits/
   parses run at once, regardless of how many requests arrive — excess
   requests wait or get a 429, never spawn unbounded threads.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor

CPU_WORKER_POOL = ThreadPoolExecutor(max_workers=3, thread_name_prefix="avaran_cpu_worker")

TRAINING_SEMAPHORE = asyncio.Semaphore(2)
STATEMENT_SEMAPHORE = asyncio.Semaphore(3)


async def run_cpu_bound(fn, /, *args, **kwargs):
    """Run a blocking, CPU-bound callable on CPU_WORKER_POOL instead of
    asyncio's default thread pool, so heavy fits/parses stay isolated from
    the rest of the app's I/O-bound thread usage."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(CPU_WORKER_POOL, lambda: fn(*args, **kwargs))


async def try_acquire(semaphore: asyncio.Semaphore) -> bool:
    """Non-blocking acquire: True and holds a slot if one was free, False
    (holds nothing) if the semaphore is already at capacity. Callers use
    this to return 429 immediately instead of queuing behind a full
    semaphore — see financial_profile.py's statement-upload endpoint.

    NOTE: an earlier version of this wrapped acquire() in
    wait_for(timeout=0), on the assumption that's the standard non-
    blocking idiom. It isn't reliable: wait_for schedules both the
    wrapped coroutine and its timeout as separate callbacks on the event
    loop, and a real test (test_concurrency.py) caught it returning False
    even with a slot free, immediately, every time. asyncio.Semaphore's
    own locked()/acquire() need no such wrapping — locked() is a plain
    attribute check and acquire() only awaits (suspends) when it would
    otherwise block, so checking locked() then calling acquire() with no
    `await` in between is atomic on asyncio's single-threaded loop: nothing
    else can run between the check and the (non-suspending) acquire."""
    if semaphore.locked():
        return False
    await semaphore.acquire()
    return True
