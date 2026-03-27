"""
In-memory async job store for long-running CSV processing tasks.

Uses a ThreadPoolExecutor so Flask request threads return immediately.
Job results are stored in a dict protected by a threading.Lock.
Jobs expire after JOB_TTL_SECONDS and are cleaned up by a background timer.

No external dependencies (Redis, Celery) required.
"""

import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

JOB_TTL_SECONDS = int(os.getenv("JOB_TTL_SECONDS", "600"))   # 10 min
JOB_TIMEOUT_SECONDS = int(os.getenv("JOB_TIMEOUT_SECONDS", "120"))  # 2 min per job
_MAX_WORKERS = int(os.getenv("JOB_WORKERS", "4"))

_store: dict[str, dict] = {}
_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=_MAX_WORKERS, thread_name_prefix="pvjob")


# ── Public API ─────────────────────────────────────────────────────────────────

def create_job() -> str:
    """Create a new job record and return its UUID."""
    job_id = str(uuid.uuid4())
    with _lock:
        _store[job_id] = {
            "status": "queued",
            "progress": 0,
            "result": None,
            "error": None,
            "created_at": time.time(),
        }
    return job_id


def update_job(job_id: str, **kwargs) -> None:
    """Thread-safe update of job fields."""
    with _lock:
        if job_id in _store:
            _store[job_id].update(kwargs)


def get_job(job_id: str) -> dict | None:
    """Return a snapshot of the job dict, or None if not found / expired."""
    with _lock:
        entry = _store.get(job_id)
        return dict(entry) if entry is not None else None


def has_capacity() -> bool:
    """Return False if the worker pool queue is already saturated."""
    # ThreadPoolExecutor doesn't expose queue depth directly;
    # count active futures as a proxy. Allow up to 2× workers queued.
    active = sum(1 for _ in _executor._threads if _.is_alive())  # type: ignore[attr-defined]
    return active < _MAX_WORKERS * 2


def submit_job(job_id: str, fn, *args, **kwargs) -> None:
    """Submit fn(job_id, *args, **kwargs) to the thread pool."""
    def _run():
        try:
            update_job(job_id, status="running", progress=10)
            result = fn(job_id, *args, **kwargs)
            update_job(job_id, status="done", progress=100, result=result)
        except Exception as exc:  # noqa: BLE001
            update_job(job_id, status="error", error=str(exc))

    _executor.submit(_run)


def cancel_job(job_id: str) -> bool:
    """
    Best-effort cancel: marks job as cancelled if still queued.
    Running jobs cannot be interrupted (Python threads aren't cancellable).
    """
    with _lock:
        entry = _store.get(job_id)
        if entry and entry["status"] == "queued":
            entry["status"] = "cancelled"
            entry["error"] = "Cancelled by user"
            return True
    return False


def cleanup_expired() -> int:
    """Remove jobs older than JOB_TTL_SECONDS. Returns count removed."""
    cutoff = time.time() - JOB_TTL_SECONDS
    with _lock:
        expired = [k for k, v in _store.items() if v["created_at"] < cutoff]
        for k in expired:
            del _store[k]
    return len(expired)


# ── Background cleanup timer ───────────────────────────────────────────────────

def _schedule_cleanup():
    cleanup_expired()
    t = threading.Timer(300, _schedule_cleanup)  # every 5 minutes
    t.daemon = True
    t.start()


_schedule_cleanup()
