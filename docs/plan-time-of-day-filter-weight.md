# Plan: Time-of-day weight for PVWatts filter

## Problem

Removed points cluster at **beginning and end of day** even when the absolute difference between P_DC and PVWatts is small. Cause:

- **Relative error** = `|P_DC − PVWatts| / PVWatts`. When both P_DC and PVWatts are low (ramp-up/ramp-down), the same small absolute difference becomes a large relative error, so many points are flagged as "removed" even though they are acceptable.

## Goal

Add a **time-of-day multiplier** that:

- Is **1 in the middle of the day** (max production) → no change to effective threshold.
- **Decreases toward the two sides** (morning/evening) → at low sun we scale the error down before comparing to the threshold, so fewer points are removed when the difference is small.

So: **scaled_error = rel_error × time_weight**, then `status = valid` if `scaled_error ≤ threshold`.

---

## 1. Define the time-of-day weight

**Option A – Hour-based (recommended)**  
- Input: timestamp (or hour) per row.  
- Weight = 1 at solar noon, and decreases toward morning/evening.  
- Example (symmetric around noon):  
  - Solar noon hour (e.g. 12) as parameter or fixed.  
  - `weight = max(min_weight, 1 − (1 − min_weight) × |hour − solar_noon| / half_day_width)`  
  - Or smooth: `weight = min_weight + (1 − min_weight) × (1 + cos(π × (hour − solar_noon) / 12)) / 2`  
- Pros: Simple, no need for daily max. Cons: Assumes symmetric day; solar noon could be made configurable later.

**Option B – Power-based**  
- Weight from normalized power (e.g. PVWatts / max_daily_PVWatts) so weight = 1 at max production and ~0 at no production.  
- Pros: Automatically adapts to season/location. Cons: Requires grouping by day and computing daily max; slightly more logic.

**Recommendation:** Start with **Option A** (hour-based) and one optional parameter: **min_weight** (e.g. 0.2) so weight never goes below that at the edges.

---

## 2. Backend (`backend/datafiltering.py`)

- Add an optional parameter to `pvwatts_filter`, e.g. **`time_weight_min: float | None = None`**.  
  - If `None`: keep current behavior (no time weighting).  
  - If a number in [0, 1]: apply time-of-day weighting.
- For each row:
  - Compute `rel_error` as now: `|P_DC − PVWatts| / PVWatts`.
  - If time weighting is enabled:
    - Get hour (e.g. from `df["time"]`).
    - Compute `time_weight` (e.g. hour-based formula with `time_weight_min`).
    - `scaled_error = rel_error * time_weight`.
  - Else: `scaled_error = rel_error`.
  - `status = "valid"` if `scaled_error <= threshold` else `"removed"`.
- Optionally store `rel_error` as the **scaled** value when weighting is on (so exports and any downstream logic see the value actually used for the decision). Document this in the docstring.
- Keep denominator as **PVWatts** (as now) to avoid division by zero when P_DC is zero.

---

## 3. Frontend (`src/pages/DataFilteringPage.jsx`)

- **`pvwattsFilterJS(comparisonData, threshold, options)`**  
  - Add optional third argument, e.g. `options = { timeWeightMin: undefined }`.  
  - If `timeWeightMin == null` or `undefined`: current behavior (no weighting).  
  - If `timeWeightMin` is a number in [0, 1]:  
    - For each row, compute hour from `d.time`.  
    - Use the **same** hour-based weight formula as the backend (e.g. same solar noon and same `min_weight`).  
    - `scaledError = relError * timeWeight`.  
    - `status = scaledError <= t ? "valid" : "removed"`.  
  - Store the value used for the decision (e.g. `scaled_error` or keep `rel_error` and add `scaled_error` for display) so the UI and tables stay consistent.
- **UI**  
  - Add a control for “Time-of-day weight” (or “Soften threshold at dawn/dusk”):  
    - **Off** (default): `timeWeightMin = undefined` → no weighting.  
    - **On**: enable weighting; optionally a slider or number input for **min weight** (e.g. 0.2–1.0, default 0.2).  
  - Place it next to the existing “filter threshold (rel. error)” control.  
  - Help text: e.g. “Scale relative error by a time-of-day factor (1 at noon, lower at dawn/dusk) so fewer points are removed when the sun is low.”
- **filterResult**  
  - Keep using `pvwattsFilterJS(comparisonData, filterThreshold, { timeWeightMin: ... })` so that when the user turns the option on, the second chart and tables immediately reflect the new behavior.

---

## 4. Keep backend and frontend in sync

- Use the **same formula** for the time weight in both places (same solar noon, same `min_weight` semantics).  
- If later you add solar-noon or half-day width as parameters, add them in both backend and frontend and document the formula in one place (e.g. in the backend docstring) and mirror it in JS.

---

## 5. Testing / sanity checks

- With **time weight off**: results unchanged vs current behavior.  
- With **time weight on** and **min_weight = 0.2**:  
  - Fewer removed points at the beginning and end of the day for the same threshold.  
  - Midday behavior almost unchanged (weight ≈ 1).  
- Optional: unit test with a small DataFrame (e.g. 3 rows: morning, noon, evening) and fixed P_DC/PVWatts to check that morning/evening get a lower scaled error than noon for the same rel_error.

---

## 6. Optional follow-ups

- Make **solar noon** configurable (e.g. from system or location).  
- Use **power-based** weight (Option B) as an alternative mode.  
- Expose **scaled_error** in the filtered data table when time weighting is on, so users can see the value that was compared to the threshold.

---

## Summary

| Where        | Change |
|-------------|--------|
| **Backend** | Add optional `time_weight_min`; compute hour-based weight; `scaled_error = rel_error * weight`; compare `scaled_error` to threshold. |
| **Frontend**| Add `options.timeWeightMin` to `pvwattsFilterJS`; same weight formula; new UI toggle + optional min-weight input. |
| **Sync**    | Same weight formula and semantics in both backend and frontend. |

This keeps the current “strict” behavior by default and adds a simple, predictable way to make the filter less aggressive at the two sides of the day while leaving the middle of the day unchanged.
