"""
Concurrent parse smoke test for the LCOE tool PVSyst PDF parser endpoint.

Usage:
  python3 concurrent_parse_smoke_test.py --pdf /path/to/report.pdf --endpoint http://localhost:5001/api/parse-pvsyst --concurrency 8

This script sends the same PDF file in parallel and prints a success/error summary.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import string
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


def _multipart_body(pdf_path: str, boundary: str) -> bytes:
    filename = os.path.basename(pdf_path)
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    # Keep it simple: boundary + content-disposition + pdf bytes.
    # The backend expects the form field name to be "file".
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode("utf-8")

    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
    return head + pdf_bytes + tail


def parse_one(endpoint: str, body: bytes, boundary: str, timeout_s: float) -> dict:
    req = urllib.request.Request(endpoint, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Accept", "application/json")

    with urllib.request.urlopen(req, data=body, timeout=timeout_s) as resp:
        resp_bytes = resp.read()
        is_ok = 200 <= resp.status < 300
        try:
            return {"ok": is_ok, "status": resp.status, "json": json.loads(resp_bytes)}
        except Exception:
            return {"ok": is_ok, "status": resp.status, "json": {"raw": resp_bytes[:200].decode("utf-8", "replace")}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, help="Path to a PVSyst PDF report to upload.")
    ap.add_argument("--endpoint", default="http://localhost:5001/api/parse-pvsyst", help="Parser endpoint URL.")
    ap.add_argument("--concurrency", type=int, default=6, help="Number of parallel requests.")
    ap.add_argument("--timeout", type=float, default=60.0, help="Per-request timeout seconds.")
    args = ap.parse_args()

    if not os.path.exists(args.pdf):
        raise SystemExit(f"PDF not found: {args.pdf}")

    boundary = "pvcopilot_" + "".join(random.choice(string.ascii_letters + string.digits) for _ in range(12))
    body = _multipart_body(args.pdf, boundary)

    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as ex:
        futures = [ex.submit(parse_one, args.endpoint, body, boundary, args.timeout) for _ in range(max(1, args.concurrency))]
        for fut in as_completed(futures):
            try:
                results.append(fut.result())
            except Exception as e:
                results.append({"ok": False, "error": str(e)})

    ok = [r for r in results if r.get("ok")]
    failed = [r for r in results if not r.get("ok")]

    print("---- Concurrent parse smoke test ----")
    print(f"Endpoint: {args.endpoint}")
    print(f"PDF: {args.pdf}")
    print(f"Concurrency: {args.concurrency}")
    print(f"Success: {len(ok)} / {len(results)}")
    print(f"Failed: {len(failed)} / {len(results)}")
    if failed:
        print("Failure samples:")
        for r in failed[:5]:
            print("-", r)

    if ok:
        # Print a tiny proof that we got the expected shape.
        sample = ok[0]
        json_obj = sample.get("json")
        print("Sample keys:", sorted((json_obj or {}).keys())[:20])


if __name__ == "__main__":
    main()

