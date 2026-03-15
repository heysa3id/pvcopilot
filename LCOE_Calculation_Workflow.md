# LCOE Calculation Workflow — PVCopilot

## 1. Input Parameters

| Parameter | Symbol | Default | Unit |
|-----------|--------|---------|------|
| System Capacity (DC STC) | `systemCapacity` | 1000 | kWp |
| Specific Yield | `specificYield` | 1883 | kWh/kWp |
| Performance Ratio | `performanceRatio` | 82.53 | % |
| Annual Energy Production | `annualEnergy` | 1,879,234 | kWh/yr |
| First-Year Factor | `f₁` | 0.975 | — |
| Linear Degradation Rate | `d` | 0.42 | %/yr |
| Discount Rate (WACC) | `r` | 5.0 | % |
| Project Lifetime | `n` | 25 | years |
| O&M Cost | `omPerKwp` | 12 | $/kWp/yr |
| Feed-in Tariff / PPA | `tariffPrice` | 0.09 | $/kWh |

### CAPEX Breakdown ($/kWp)

| Category | Item | Default ($/kWp) |
|----------|------|-----------------|
| **Module & Inverter Hardware** | Modules | 200 |
| | Inverters | 80 |
| **Balance of System** | Racking & Mounting | 100 |
| | Grid Connection | 40 |
| | Cabling / Wiring | 40 |
| | Safety & Security | 7.6 |
| | Monitoring & Control | 3.2 |
| **Installation** | Mechanical Installation | 60 |
| | Electrical Installation | 56.9 |
| | Inspection | 8.2 |
| **Soft Costs** | Margin | 47 |
| | Financing Costs | 3.4 |
| | System Design | 8.7 |
| | Permitting | 12.9 |
| | Incentive Application | 10.9 |
| | Customer Acquisition | 3.5 |
| **Total** | | **682.3 $/kWp** |

---

## 2. Calculation Workflow

### Step 1 — Compute Totals

```
CAPEX ($/kWp)  = Sum of all CAPEX items
CAPEX (total)  = CAPEX ($/kWp) × System Capacity (kWp)
O&M (annual)   = O&M ($/kWp/yr) × System Capacity (kWp)
```

### Step 2 — Energy Degradation Model (Linear)

For each year `t` (1 to n):

```
Degradation Factor:  degF(t) = max(0, f₁ − d × t)

Year 0 energy:       E₀ = Annual Energy (no degradation)
Year t energy:       Eₜ = E₀ × degF(t),  for t ≥ 1
```

By year 25: output = `f₁ − d × 25` = 0.975 − 0.0042 × 25 = **87.0% of initial**.

### Step 3 — Discounted Cash Flows

Initialize:
```
Total Discounted Energy = E₀         (year 0, undiscounted)
Total Discounted Costs  = CAPEX_total (year 0, upfront)
```

For each year `t` (1 to n):
```
Discount factor:         disc(t) = (1 + r)^t

Discounted Energy:       dE(t) = E₀ × degF(t) / disc(t)
Discounted O&M Cost:     dC(t) = O&M_annual / disc(t)

Total Discounted Energy += dE(t)
Total Discounted Costs  += dC(t)
```

### Step 4 — LCOE Calculation

```
LCOE = Total Discounted Costs / Total Discounted Energy   ($/kWh)

LCOE ($/MWh) = LCOE × 1000
```

**Rating thresholds** (based on $/MWh):
- LCOE < 34 $/MWh → **Excellent**
- 34 ≤ LCOE ≤ 45 $/MWh → **Rentable**
- LCOE > 45 $/MWh → **Low**

### Step 5 — Financial Indicators

#### Capacity Factor
```
CF = (Annual Energy) / (System Capacity × 8760 hours) × 100   (%)
```

#### Lifetime Energy
```
Lifetime Energy = E₀/1000 + Σ(t=1..n) E₀ × degF(t) / 1000   (MWh)
```

#### Simple Payback
```
Year-1 Revenue = E₀ × f₁ × Tariff Price
Simple Payback = CAPEX_total / (Year-1 Revenue − O&M_annual)   (years)
```

#### NPV (Net Present Value)
```
NPV(rate) = −CAPEX_total + Σ(t=1..n) [(E₀ × degF(t) × Tariff − O&M_annual) / (1 + rate)^t]

Project NPV = NPV(r)    where r = WACC
```

#### IRR (Internal Rate of Return)
Solved numerically via bisection method (70 iterations):
```
Find rate such that NPV(rate) = 0

Search range: [-0.5, 5.0]
Bisection: if NPV(mid) > 0 → lo = mid, else → hi = mid
IRR = (lo + hi) / 2 × 100   (%)
```

### Step 6 — Discounted Payback (TRI)

Build year-by-year discounted cash flow:

```
For each year t (1 to n):
    disc_factor     = (1 + r)^(t-1)
    degF            = max(0, f₁ − d × t)
    Revenue         = E₀ × degF × Tariff
    Disc. Revenue   = Revenue / disc_factor
    Disc. OPEX      = O&M_annual / disc_factor
    Disc. CAPEX     = CAPEX_total if t=1, else 0
    Disc. Net CF    = Disc. Revenue − Disc. OPEX − Disc. CAPEX
    Cumulative CF  += Disc. Net CF

Discounted Payback = year where cumulative CF crosses zero
                   = (t−1) + |prev_cumulative| / Disc. Net CF(t)
```

### Step 7 — Sensitivity Analysis (Tornado)

For each input parameter, apply ±20% variation and recalculate LCOE:

| Parameter Varied | Method |
|-------------------|--------|
| CAPEX Components | All CAPEX items × factor |
| Discount Rate | WACC × factor |
| Annual Energy | Energy × factor |
| O&M Cost | O&M $/kWp × factor |
| Project Lifetime | Lifetime × factor (rounded) |
| Degradation Rate | Degradation × factor |
| Tariff / PPA | Tariff × factor |

```
For each parameter:
    LCOE_low  = calcAll(param × 0.8).lcoe − base LCOE
    LCOE_high = calcAll(param × 1.2).lcoe − base LCOE
    Swing     = LCOE_high − LCOE_low

Sort by swing (descending) → tornado chart
```

---

## 3. Flowchart Summary

```
┌─────────────────────────────────┐
│        INPUT PARAMETERS         │
│  System capacity, yield, PR,    │
│  degradation, WACC, lifetime,   │
│  CAPEX items, O&M, tariff       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│     STEP 1: COMPUTE TOTALS     │
│  CAPEX_total = Σ items × kWp   │
│  O&M_annual  = O&M/kWp × kWp  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  STEP 2: DEGRADATION MODEL     │
│  degF(t) = max(0, f₁ − d×t)   │
│  Eₜ = E₀ × degF(t)            │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  STEP 3: DISCOUNT CASH FLOWS   │
│  For t = 1..n:                  │
│    dE = Eₜ / (1+r)^t           │
│    dC = O&M / (1+r)^t          │
│  Σ disc. energy, Σ disc. costs  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│      STEP 4: LCOE = ΣC / ΣE    │
│  $/kWh and $/MWh                │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   STEP 5: FINANCIAL METRICS    │
│  Capacity Factor, NPV, IRR,    │
│  Simple Payback, Lifetime MWh  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  STEP 6: DISCOUNTED PAYBACK    │
│  Year-by-year cumulative DCF   │
│  Interpolate zero-crossing     │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  STEP 7: SENSITIVITY ANALYSIS  │
│  ±20% on 7 parameters          │
│  Tornado chart by LCOE swing   │
└─────────────────────────────────┘
```

---

## 4. Key Formulas (Quick Reference)

| Metric | Formula |
|--------|---------|
| **LCOE** | `Σ Costₜ/(1+r)^t  ÷  Σ Eₜ/(1+r)^t` |
| **Degradation** | `degF(t) = max(0, f₁ − d×t)` |
| **Capacity Factor** | `E_annual / (kWp × 8760) × 100` |
| **Simple Payback** | `CAPEX / (Rev_yr1 − O&M)` |
| **NPV** | `−CAPEX + Σ (Rev_t − O&M) / (1+r)^t` |
| **IRR** | `rate where NPV = 0` (bisection) |
| **Disc. Payback** | `t where cumulative DCF ≥ 0` |

---

## 5. Code Reference (LcoeTool.jsx)

| Symbol / Term | Code variable | Type |
|---------------|---------------|------|
| System capacity (kWp) | `systemCapacity` | number |
| Annual energy (kWh/yr) | `annualEnergy` | number |
| First-year factor f₁ | `firstYearFactor` | number (e.g. 0.975) |
| Linear degradation d | `linearDeg` | number (e.g. 0.0042 = 0.42%/yr) |
| Discount rate r | `discountRate` | number (% e.g. 5.0) |
| Project lifetime n | `projectLifetime` | number (years) |
| O&M $/kWp/yr | `omPerKwp` | number |
| Tariff / PPA ($/kWh) | `tariffPrice` | number |
| CAPEX items ($/kWp) | `capex` | object (e.g. `capex.modules`, `capex.inverters`) |
| **LCOE engine** | `calcAll(p)` | function: params → { lcoe, capacityFactor, projectNpv, irr, … } |

Degradation in code: `degF = Math.max(0, firstYearFactor - linearDeg * t)`.  
Discount factor: `disc = Math.pow(1 + r, t)` with `r = discountRate/100`.

---

*Exported from PVCopilot — www.pvcopilot.com*
