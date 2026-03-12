"""
PVSyst PDF Report Parser
Extracts simulation parameters from PVSyst v6/v7/v8 reports using pdfplumber.
No API key required — runs fully offline.
"""

import re
import pdfplumber


def _num(text, default=None):
    """Extract first number from text string."""
    if text is None:
        return default
    m = re.search(r'[-+]?\d+\.?\d*', str(text).replace(',', '.'))
    return float(m.group()) if m else default


def _find(text, pattern, group=1, default=None, flags=0):
    """Search for regex pattern and return group."""
    m = re.search(pattern, text, flags)
    return m.group(group).strip() if m else default


def parse_pvsyst_pdf(pdf_path):
    """
    Parse a PVSyst simulation report PDF and return extracted parameters.

    Returns a dict with all simulation parameters matching the JSON schema
    used by the LCOE tool frontend.
    """
    pages_text = []
    full_text = ""

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            pages_text.append(t)
            full_text += t + "\n"

    result = {
        "systemCapacity": None,
        "ratedPowerAC": None,
        "dcAcRatio": None,
        "modulePower": None,
        "numModules": None,
        "specificYield": None,
        "annualEnergy": None,
        "performanceRatio": None,
        "systemType": None,
        "tilt": None,
        "azimuth": None,
        "location": None,
        "country": None,
        "latitude": None,
        "longitude": None,
        "systemConfig": None,
        "moduleManufacturer": None,
        "moduleModel": None,
        "inverterManufacturer": None,
        "inverterModel": None,
        "ghi": None,
        "gti": None,
        "degradationRate": None,
        "pvSystVersion": None,
        "projectName": None,
        "simulationYear": None,
    }

    # ── PAGE 1: Cover page ──────────────────────────────────────────────
    p1 = pages_text[0] if len(pages_text) > 0 else ""

    # PVsyst version
    v = _find(full_text, r'(?:Version|PVsyst\s+V?)(\d+\.\d+\.\d+)', 1)
    if not v:
        v = _find(full_text, r'PVsyst\s+V(\d+\.\d+\.\d+)', 1)
    result["pvSystVersion"] = v

    # Project name
    result["projectName"] = _find(p1, r'Project:\s*(.+)', 1)

    # System power from cover
    cover_power_wp = _num(_find(p1, r'System\s+power:\s*([\d.,]+)\s*Wp', 1))
    cover_power_kwp = _num(_find(p1, r'System\s+power:\s*([\d.,]+)\s*kWp', 1))

    # Location from cover
    # Pattern: "City - Country" or "City_XX - Country"
    loc_match = re.search(r'(?:Benguerir|[\w_]+)_?\w*\s*-\s*(\w+)', p1)
    if not loc_match:
        # Try last non-empty lines before "Auteur"
        lines = [l.strip() for l in p1.split('\n') if l.strip()]
        for line in lines:
            if ' - ' in line and 'simulation' not in line.lower():
                parts = line.split(' - ')
                if len(parts) == 2:
                    result["location"] = parts[0].strip()
                    result["country"] = parts[1].strip()
                    break

    # ── PAGE 2: Project summary ─────────────────────────────────────────
    p2 = pages_text[1] if len(pages_text) > 1 else ""

    # Location & country from geographical site
    geo_loc = _find(p2, r'Geographical\s+Site.*?\n([\w_]+)', 1)
    geo_country = _find(p2, r'Geographical\s+Site.*?\n[\w_]+\n(\w+)', 1)
    if geo_loc and not result["location"]:
        result["location"] = geo_loc.replace('_', ' ')
    if geo_country and not result["country"]:
        result["country"] = geo_country

    # More robust location parsing
    if not result["location"]:
        loc = _find(p2, r'(?:Benguerir|Geographical\s+Site\s+Situation.*?\n)(\S+)', 1)
        if loc:
            result["location"] = loc.replace('_', ' ')
    if not result["country"]:
        country = _find(p2, r'(?:Maroc|Morocco|France|Spain|Germany|Italy)', 0)
        if country:
            result["country"] = country

    # Latitude
    lat_str = _find(p2, r'Latitude\s+([\d.]+)\s*°?\s*([NS])', 0)
    if lat_str:
        lat_val = _num(lat_str)
        if lat_val and 'S' in lat_str.upper():
            lat_val = -lat_val
        result["latitude"] = lat_val

    # Longitude
    lon_str = _find(p2, r'Longitude\s+([-\d.]+)\s*°?\s*([EW]?)', 0)
    if lon_str:
        lon_val = _num(lon_str)
        if lon_val is not None:
            if 'W' in lon_str.upper() and lon_val > 0:
                lon_val = -lon_val
            result["longitude"] = lon_val

    # Tilt / Azimuth
    tilt_az = _find(p2, r'Tilt/Azimuth\s+([\d.]+)\s*/\s*([\d.]+)', 0)
    if tilt_az:
        result["tilt"] = _num(re.search(r'([\d.]+)\s*/', tilt_az).group(1))
        result["azimuth"] = _num(re.search(r'/\s*([\d.]+)', tilt_az).group(1))

    # System config (orientation)
    if 'Fixed plane' in p2 or 'Fixed plane' in full_text:
        result["systemConfig"] = "Fixed plane"
    elif 'Single-axis' in full_text:
        result["systemConfig"] = "Single-axis tracking"
    elif 'Two-axis' in full_text:
        result["systemConfig"] = "Two-axis tracking"

    # PV Array - Pnom total (DC capacity)
    # Try kWp first, then Wp
    pnom_kwp = _num(_find(p2, r'Pnom\s+total\s+([\d.,]+)\s*kWp', 1))
    pnom_wp = _num(_find(p2, r'Pnom\s+total\s+([\d.,]+)\s*Wp', 1))
    if pnom_kwp:
        result["systemCapacity"] = pnom_kwp
    elif pnom_wp:
        result["systemCapacity"] = pnom_wp / 1000
    elif cover_power_kwp:
        result["systemCapacity"] = cover_power_kwp
    elif cover_power_wp:
        result["systemCapacity"] = cover_power_wp / 1000

    # Number of modules
    nb_modules = _num(_find(p2, r'Nb\.\s*of\s+modules\s+([\d]+)', 1))
    result["numModules"] = int(nb_modules) if nb_modules else None

    # Inverter AC power
    inv_kw = _num(_find(p2, r'Inverters.*?Pnom\s+total\s+([\d.,]+)\s*(?:kW|W)', 1))
    inv_w = _num(_find(p2, r'Pnom\s+total\s+([\d.,]+)\s*W\b', 1))
    # Check for kWac in page 3 too
    inv_kwac_p3 = None

    # Pnom ratio
    pnom_ratio = _num(_find(p2, r'Pnom\s+ratio\s+([\d.,]+)', 1))
    result["dcAcRatio"] = pnom_ratio

    # Results summary
    produced = _num(_find(p2, r'Produced\s+Energy\s+([\d.,]+)\s*kWh/year', 1))
    spec_prod = _num(_find(p2, r'Specific\s+production\s+([\d.,]+)\s*kWh/kWp/year', 1))
    pr = _num(_find(p2, r'Perf\.\s*Ratio\s+PR\s+([\d.,]+)\s*%', 1))

    result["specificYield"] = spec_prod
    result["performanceRatio"] = pr

    # System type detection
    has_battery = bool(re.search(r'Battery\s+pack|Storage\s+strategy|Self.?consumption|Solar\s+Fraction\s+SF', p2, re.IGNORECASE))
    has_grid = bool(re.search(r'E_Grid|EFrGrid|Grid.Connected', full_text, re.IGNORECASE))
    has_e_solar = bool(re.search(r'E_Solar', full_text))

    if has_battery and has_grid:
        result["systemType"] = "grid-connected-battery"
    elif has_battery:
        result["systemType"] = "battery"
    else:
        result["systemType"] = "grid-connected"

    # Annual energy
    # For battery/self-consumption: use Produced Energy (= E_Solar)
    # For grid-connected: use E_Grid from main results Year row
    if produced:
        result["annualEnergy"] = produced

    # ── PAGE 3: PV Array Characteristics ────────────────────────────────
    p3 = pages_text[2] if len(pages_text) > 2 else ""

    # PV Module info
    # Manufacturer line comes after "PV module" header
    mod_mfr = _find(p3, r'(?:PV\s+module|PV module)\s*(?:Inverter)?\s*\n\s*Manufacturer\s+(\S+(?:\s+\S+)*?)(?:\s+Manufacturer)', 1)
    if not mod_mfr:
        mod_mfr = _find(p3, r'PV\s+module\s+Inverter\s*\nManufacturer\s+(\S+)', 1)
    if not mod_mfr:
        # Try finding after "PV module" on same line
        lines = p3.split('\n')
        for i, line in enumerate(lines):
            if 'Manufacturer' in line and i > 0:
                # First manufacturer is PV module
                parts = re.split(r'\s{2,}', line.strip())
                if len(parts) >= 2:
                    mod_mfr = parts[0].replace('Manufacturer', '').strip()
                    if not mod_mfr and len(parts) >= 3:
                        mod_mfr = parts[1]
                break

    result["moduleManufacturer"] = _find(p3, r'PV\s+module.*?Manufacturer\s+(\w+(?:\s+\w+)*?)(?:\s+Manufacturer|\n)', 1, flags=re.DOTALL)
    if not result["moduleManufacturer"]:
        # Fallback: find all "Manufacturer" lines
        mfrs = re.findall(r'Manufacturer\s+(.+?)(?:\s{2,}|$)', p3, re.MULTILINE)
        if len(mfrs) >= 1:
            result["moduleManufacturer"] = mfrs[0].strip().split('  ')[0].strip()
        if len(mfrs) >= 2:
            result["inverterManufacturer"] = mfrs[0].strip().split('  ')[-1].strip() if '  ' in mfrs[0] else None

    # Try structured extraction from Manufacturer lines
    mfr_lines = [l for l in p3.split('\n') if 'Manufacturer' in l and 'Original' not in l]
    for mline in mfr_lines:
        # Try splitting by double-space
        parts = re.split(r'\s{2,}', mline.strip())
        parts = [p.strip() for p in parts if p.strip() and p.strip() != 'Manufacturer']
        if len(parts) >= 2:
            result["moduleManufacturer"] = parts[0]
            result["inverterManufacturer"] = parts[1]
            break
        elif len(parts) == 1:
            # Try splitting by repeated "Manufacturer" keyword
            raw = mline.strip()
            mfr_parts = re.split(r'\bManufacturer\b', raw)
            mfr_parts = [p.strip() for p in mfr_parts if p.strip()]
            if len(mfr_parts) >= 2:
                result["moduleManufacturer"] = mfr_parts[0]
                result["inverterManufacturer"] = mfr_parts[1]
            elif len(mfr_parts) == 1 and not result["moduleManufacturer"]:
                result["moduleManufacturer"] = mfr_parts[0]
            break

    # Model lines
    model_lines = [l for l in p3.split('\n') if l.strip().startswith('Model') and 'Models used' not in l and 'Model Generic' not in l]
    for mline in model_lines:
        # Try splitting by double-space first
        parts = re.split(r'\s{2,}', mline.strip())
        parts = [p.strip() for p in parts if p.strip() and p.strip() != 'Model']
        if len(parts) >= 2:
            result["moduleModel"] = parts[0]
            result["inverterModel"] = parts[1]
            break
        elif len(parts) == 1:
            # Try splitting by repeated "Model" keyword
            raw = mline.strip()
            model_parts = re.split(r'\bModel\b', raw)
            model_parts = [p.strip() for p in model_parts if p.strip()]
            if len(model_parts) >= 2:
                result["moduleModel"] = model_parts[0]
                result["inverterModel"] = model_parts[1]
            elif len(model_parts) == 1 and not result["moduleModel"]:
                result["moduleModel"] = model_parts[0]
            break

    # Unit nominal power - module
    mod_power = _num(_find(p3, r'Unit\s+Nom\.\s+Power\s+([\d.,]+)\s*Wp', 1))
    result["modulePower"] = mod_power

    # Unit nominal power - inverter (kWac)
    inv_power = _num(_find(p3, r'Unit\s+Nom\.\s+Power\s+([\d.,]+)\s*kWac', 1))
    if inv_power:
        result["ratedPowerAC"] = inv_power

    # Number of modules (if not found in p2)
    if not result["numModules"]:
        nm = _num(_find(p3, r'Number\s+of\s+PV\s+modules\s+([\d]+)', 1))
        result["numModules"] = int(nm) if nm else None

    # Total inverter power
    total_inv = _num(_find(p3, r'Total\s+(?:inverter\s+)?power\s+([\d.,]+)\s*kWac', 1))
    if total_inv and not result["ratedPowerAC"]:
        result["ratedPowerAC"] = total_inv

    # Pnom ratio from page 3
    if not result["dcAcRatio"]:
        ratio = _num(_find(p3, r'Pnom\s+ratio\s+(?:\(DC:AC\)\s+)?([\d.,]+)', 1))
        result["dcAcRatio"] = ratio

    # Nominal STC from page 3
    nominal_stc_kwp = _num(_find(p3, r'Nominal\s+\(STC\)\s+([\d.,]+)\s*kWp', 1))
    if nominal_stc_kwp and not result["systemCapacity"]:
        result["systemCapacity"] = nominal_stc_kwp

    # ── PAGE 4: Array losses — degradation ──────────────────────────────
    p4 = pages_text[3] if len(pages_text) > 3 else ""

    deg = _num(_find(p4, r'Loss\s+factor\s+([\d.,]+)\s*%/year', 1))
    if deg is None:
        deg = _num(_find(full_text, r'(?:degradation|Loss\s+factor)\s+([\d.,]+)\s*%/year', 1))
    result["degradationRate"] = deg

    # Simulation year
    sim_year = _num(_find(full_text, r'(?:Simulation\s+for\s+year\s+no|Year\s+no)\s+(\d+)', 1))
    result["simulationYear"] = int(sim_year) if sim_year else None

    # ── PAGE 6: Main results — annual totals ────────────────────────────
    p6 = pages_text[5] if len(pages_text) > 5 else ""

    # GHI and GTI from Year row
    year_row = _find(p6, r'Year\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)', 0)
    if year_row:
        nums = re.findall(r'[\d.]+', year_row)
        if len(nums) >= 4:
            result["ghi"] = float(nums[0])
            result["gti"] = float(nums[3])

    # E_Solar from Year row (for battery systems)
    # Columns: GlobHor DiffHor T_Amb GlobInc GlobEff EArray E_User E_Solar EUnused EFrGrid
    year_match = re.search(
        r'Year\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)',
        p6
    )
    if year_match:
        result["ghi"] = float(year_match.group(1))
        result["gti"] = float(year_match.group(4))
        e_array = float(year_match.group(6))
        e_user = float(year_match.group(7))
        e_solar = float(year_match.group(8))
        e_unused = float(year_match.group(9))
        e_frgrid = float(year_match.group(10))

        # For battery systems, use E_Solar (Produced Energy)
        # For grid systems, check if there's an E_Grid column
        if result["systemType"] in ("battery", "grid-connected-battery"):
            result["annualEnergy"] = e_solar
        else:
            # For grid-connected, E_Solar might actually be E_Grid
            result["annualEnergy"] = e_solar

    # Also check Produced Energy from Main results section on page 6
    prod_p6 = _num(_find(p6, r'Produced\s+Energy\s+([\d.,]+)\s*kWh/year', 1))
    spec_p6 = _num(_find(p6, r'Specific\s+production\s+([\d.,]+)\s*kWh/kWp/year', 1))
    pr_p6 = _num(_find(p6, r'Perf\.\s*Ratio\s+PR\s+([\d.,]+)\s*%', 1))

    if prod_p6:
        result["annualEnergy"] = prod_p6
    if spec_p6:
        result["specificYield"] = spec_p6
    if pr_p6:
        result["performanceRatio"] = pr_p6

    # ── Final fixups ────────────────────────────────────────────────────
    # If systemCapacity is in Wp, convert to kWp
    if result["systemCapacity"] and result["systemCapacity"] > 1000:
        result["systemCapacity"] = result["systemCapacity"] / 1000

    # If ratedPowerAC came in W, convert to kW
    if result["ratedPowerAC"] and result["ratedPowerAC"] > 100:
        result["ratedPowerAC"] = result["ratedPowerAC"] / 1000

    # Inverter AC from p2 if not found in p3
    if not result["ratedPowerAC"]:
        # Try "Pnom total XXXW" after Inverters
        inv_w_val = _num(_find(p2, r'(?:Inverters.*?Pnom\s+total\s+)([\d.,]+)\s*W', 1, flags=re.DOTALL))
        if inv_w_val:
            result["ratedPowerAC"] = inv_w_val / 1000 if inv_w_val > 100 else inv_w_val

    # Clean location
    if result["location"]:
        result["location"] = result["location"].replace('_', ' ').strip()

    return result


if __name__ == "__main__":
    import sys
    import json

    path = sys.argv[1] if len(sys.argv) > 1 else "/Users/saidelhamaoui/Downloads/APEE-band-didactique_Project.VC0-Report.pdf"
    data = parse_pvsyst_pdf(path)
    print(json.dumps(data, indent=2))
