/**
 * useJobPoller — polls /api/jobs/{jobId} every POLL_INTERVAL_MS until the job
 * reaches a terminal state (done, error, cancelled).
 *
 * Usage:
 *   const poller = useJobPoller(API_BASE);
 *   poller.start(jobId);          // begin polling
 *   poller.stop();                // cancel polling (e.g. user clicks Cancel)
 *   poller.reset();               // return to idle (after consuming result)
 *
 * State shape:
 *   { status, progress, result, error }
 *   status: "idle" | "queued" | "running" | "done" | "error" | "cancelled"
 *   progress: 0–100
 *   result: job result object (when status === "done"), else null
 *   error: string (when status === "error"), else null
 */

import { useState, useEffect, useRef, useCallback } from "react";

const POLL_INTERVAL_MS = 2000;
const TERMINAL = new Set(["done", "error", "cancelled"]);

export function useJobPoller(apiBase) {
  const [state, setState] = useState({
    status: "idle",
    progress: 0,
    result: null,
    error: null,
  });

  const timerRef = useRef(null);

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setState({ status: "idle", progress: 0, result: null, error: null });
  }, [stop]);

  const start = useCallback(
    (jobId) => {
      stop();
      setState({ status: "queued", progress: 0, result: null, error: null });

      timerRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${apiBase}/api/jobs/${jobId}`);
          if (res.status === 404) {
            stop();
            setState((s) => ({
              ...s,
              status: "error",
              error: "Job expired or not found. Please re-upload the file.",
            }));
            return;
          }
          const data = await res.json();
          setState({
            status: data.status ?? "error",
            progress: data.progress ?? 0,
            result: data.result ?? null,
            error: data.error ?? null,
          });
          if (TERMINAL.has(data.status)) {
            stop();
          }
        } catch (_err) {
          stop();
          setState((s) => ({
            ...s,
            status: "error",
            error: "Lost connection to server while processing.",
          }));
        }
      }, POLL_INTERVAL_MS);
    },
    [apiBase, stop]
  );

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { ...state, start, stop, reset };
}
