"""
Lightweight in-memory metrics for the PVCopilot backend.
Tracks request counters and latency percentiles.
Exposed via GET /api/metrics.
"""

import collections
import threading

_lock = threading.Lock()
_counters: dict[str, int] = {
    "csv_success": 0,
    "csv_error": 0,
    "csv_timeout": 0,
    "pdf_success": 0,
    "pdf_error": 0,
}
_latencies: collections.deque = collections.deque(maxlen=1000)


def record(event: str, elapsed_ms: float | None = None) -> None:
    """Increment a named counter and optionally record a latency sample."""
    with _lock:
        if event in _counters:
            _counters[event] += 1
        if elapsed_ms is not None:
            _latencies.append(elapsed_ms)


def snapshot() -> dict:
    """Return a copy of counters + latency percentiles (p50, p95, p99)."""
    with _lock:
        lats = sorted(_latencies)
        n = len(lats)

        def pct(p: float) -> float:
            if not lats:
                return 0.0
            idx = max(0, int(n * p) - 1)
            return round(lats[idx], 1)

        return {
            **_counters,
            "samples": n,
            "p50_ms": pct(0.50),
            "p95_ms": pct(0.95),
            "p99_ms": pct(0.99),
        }
