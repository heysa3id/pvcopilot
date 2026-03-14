import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Colors & formatting helpers ──────────────────────────────────────────────
const GOLD = [255, 184, 0];
const DARK = [31, 41, 55];
const GRAY = [100, 116, 139];
const LIGHT_BG = [255, 253, 247];
const WHITE = [255, 255, 255];
const BLUE = [29, 155, 240];
const GREEN = [22, 163, 74];
const ORANGE = [255, 122, 69];
const RED = [220, 38, 38];
const PURPLE = [139, 92, 246];

const fmt = (n, d = 2) =>
  isNaN(n) || n == null
    ? "—"
    : Number(n.toFixed(d)).toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
const fmtK = (n) =>
  n >= 1e6 ? `${fmt(n / 1e6, 2)}M` : n >= 1e3 ? `${fmt(n / 1e3, 1)}k` : fmt(n, 0);

// ── Logo loader (converts PNG to base64 for embedding) ───────────────────────
async function loadLogoBase64() {
  try {
    const resp = await fetch("/logo.svg");
    const svgText = await resp.text();
    // Render SVG to canvas then export as PNG for jsPDF
    return new Promise((resolve) => {
      const img = new Image();
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const scale = 3; // high-res rendering
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth * scale;
        canvas.height = img.naturalHeight * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}

// ── Horizontal rule helper ───────────────────────────────────────────────────
function drawHR(doc, y, margin, pageW) {
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  return y + 4;
}

// ── Section header helper ────────────────────────────────────────────────────
function sectionHeader(doc, title, y, margin) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.text(title, margin, y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.2);
  doc.line(margin, y + 2, margin + doc.getTextWidth(title), y + 2);
  return y + 10;
}

// ── Chart drawing helpers ─────────────────────────────────────────────────────

function drawLineChart(doc, x, y, w, h, data, { colors, labels, yLabel, xLabel, showArea = false, dualAxis = false }) {
  // Background
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 2, 2, "S");

  const padL = 14, padR = dualAxis ? 14 : 6, padT = 6, padB = 14;
  const cx = x + padL, cy = y + padT;
  const cw = w - padL - padR, ch = h - padT - padB;

  const n = data[0].length;

  // Per-axis ranges
  const ranges = dualAxis
    ? data.map(series => {
        const dataMax = Math.max(...series);
        const dataMin = Math.min(...series);
        // Use tight range (with 10% padding) so trends are visible
        const padding = (dataMax - dataMin) * 0.15 || dataMax * 0.05;
        const min = Math.max(0, dataMin - padding);
        const max = dataMax + padding;
        return { min, max, range: (max - min) || 1 };
      })
    : (() => {
        const allVals = data.flat();
        const max = Math.max(...allVals) * 1.05;
        const min = Math.min(0, Math.min(...allVals));
        return data.map(() => ({ min, max, range: (max - min) || 1 }));
      })();

  // Left Y axis grid + labels (series 0)
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.1);
  for (let i = 0; i <= 4; i++) {
    const gy = cy + ch - (ch * i / 4);
    doc.line(cx, gy, cx + cw, gy);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...(colors[0] || GRAY));
    const val = ranges[0].min + ranges[0].range * i / 4;
    doc.text(fmtK(val), cx - 2, gy + 1.5, { align: "right" });
  }

  // Right Y axis labels (series 1) when dualAxis
  if (dualAxis && data.length > 1) {
    for (let i = 0; i <= 4; i++) {
      const gy = cy + ch - (ch * i / 4);
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...(colors[1] || GRAY));
      const val = ranges[1].min + ranges[1].range * i / 4;
      doc.text(fmtK(val), cx + cw + 2, gy + 1.5, { align: "left" });
    }
  }

  // X axis labels
  const step = Math.max(1, Math.floor(n / 10));
  for (let i = 0; i < n; i += step) {
    const lx = cx + (cw * i / (n - 1));
    doc.setFontSize(5.5);
    doc.setTextColor(...GRAY);
    doc.text(`${i + 1}`, lx, cy + ch + 4, { align: "center" });
  }

  // Axis labels
  if (xLabel) {
    doc.setFontSize(6);
    doc.setTextColor(...GRAY);
    doc.text(xLabel, cx + cw / 2, cy + ch + 9, { align: "center" });
  }

  // Draw each series
  data.forEach((series, si) => {
    const color = colors[si] || GOLD;
    const r = ranges[si];
    const points = series.map((v, i) => ({
      x: cx + (cw * i / (n - 1)),
      y: cy + ch - ((v - r.min) / r.range * ch),
    }));

    // Area fill
    if (showArea) {
      doc.setFillColor(...color);
      doc.setGState(new doc.GState({ opacity: 0.12 }));
      doc.setFillColor(...color);
      doc.setDrawColor(...color);
      for (let i = 0; i < points.length - 1; i++) {
        const baseY = cy + ch;
        doc.triangle(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, points[i].x, baseY, "F");
        doc.triangle(points[i + 1].x, points[i + 1].y, points[i + 1].x, baseY, points[i].x, baseY, "F");
      }
      doc.setGState(new doc.GState({ opacity: 1 }));
    }

    // Line
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    for (let i = 0; i < points.length - 1; i++) {
      doc.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }
  });

  // Legend
  if (labels) {
    const legY = y + h - 4;
    let legX = cx;
    labels.forEach((lbl, i) => {
      doc.setDrawColor(...(colors[i] || GOLD));
      doc.setLineWidth(0.8);
      doc.line(legX, legY, legX + 6, legY);
      doc.setFontSize(5.5);
      doc.setTextColor(...GRAY);
      doc.text(lbl, legX + 8, legY + 1);
      legX += 8 + doc.getTextWidth(lbl) + 6;
    });
  }
}

function drawBarChart(doc, x, y, w, h, categories, values, { colors, horizontal = false, stacked = false }) {
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 2, 2, "S");

  const padL = horizontal ? 30 : 14, padR = 6, padT = 6, padB = horizontal ? 8 : 16;
  const cx = x + padL, cy = y + padT;
  const cw = w - padL - padR, ch = h - padT - padB;

  if (horizontal) {
    // Horizontal bars
    const maxV = Math.max(...values.map(v => Array.isArray(v) ? v.reduce((a, b) => a + b, 0) : v));
    const barH = Math.min(8, (ch - 4) / categories.length);
    const gap = (ch - barH * categories.length) / (categories.length + 1);

    categories.forEach((cat, i) => {
      const by = cy + gap + i * (barH + gap);
      const val = Array.isArray(values[i]) ? values[i] : [values[i]];
      let bx = cx;
      val.forEach((v, vi) => {
        const bw = (v / maxV) * cw;
        const c = Array.isArray(colors[0]) ? colors[vi] : colors[i] || GOLD;
        doc.setFillColor(...c);
        doc.roundedRect(bx, by, Math.max(bw, 0.5), barH, 1, 1, "F");
        bx += bw;
      });
      // Label
      doc.setFontSize(5.5);
      doc.setTextColor(...DARK);
      doc.text(cat, cx - 2, by + barH / 2 + 1.5, { align: "right" });
    });
  } else {
    // Vertical bars
    const maxV = Math.max(...values.flat()) * 1.1;
    const barW = Math.min(8, (cw - 4) / values.length);
    const gap = (cw - barW * values.length) / (values.length + 1);

    // Grid
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    for (let i = 0; i <= 4; i++) {
      const gy = cy + ch - (ch * i / 4);
      doc.line(cx, gy, cx + cw, gy);
      doc.setFontSize(5.5);
      doc.setTextColor(...GRAY);
      doc.text(fmtK(maxV * i / 4), cx - 2, gy + 1.5, { align: "right" });
    }

    values.forEach((v, i) => {
      const bx = cx + gap + i * (barW + gap);
      const bh = (v / maxV) * ch;
      const c = colors[i % colors.length] || GOLD;
      doc.setFillColor(...c);
      doc.roundedRect(bx, cy + ch - bh, barW, bh, 0.5, 0.5, "F");
    });

    // X labels (show subset)
    const step = Math.max(1, Math.floor(values.length / 12));
    for (let i = 0; i < values.length; i += step) {
      const lx = cx + gap + i * (barW + gap) + barW / 2;
      doc.setFontSize(5);
      doc.setTextColor(...GRAY);
      doc.text(categories[i] || "", lx, cy + ch + 5, { align: "center" });
    }
  }
}

function drawTornadoChart(doc, x, y, w, h, sensData) {
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 2, 2, "S");

  const padL = 42, padR = 8, padT = 6, padB = 6;
  const cx = x + padL, cy = y + padT;
  const cw = w - padL - padR, ch = h - padT - padB;
  const midX = cx + cw / 2;
  const maxSwing = Math.max(...sensData.map(s => Math.max(Math.abs(s.low), Math.abs(s.high))));
  const barH = Math.min(7, (ch - 4) / sensData.length);
  const gap = (ch - barH * sensData.length) / (sensData.length + 1);

  // Center line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(midX, cy, midX, cy + ch);

  sensData.forEach((s, i) => {
    const by = cy + gap + i * (barH + gap);

    // Favorable bar (left of center)
    const lowW = (Math.abs(s.low) / maxSwing) * (cw / 2);
    doc.setFillColor(...GOLD);
    if (s.low < 0) {
      doc.roundedRect(midX - lowW, by, lowW, barH, 1, 1, "F");
    } else {
      doc.roundedRect(midX, by, lowW, barH, 1, 1, "F");
    }

    // Unfavorable bar (right of center)
    const highW = (Math.abs(s.high) / maxSwing) * (cw / 2);
    doc.setFillColor(...ORANGE);
    if (s.high > 0) {
      doc.roundedRect(midX, by, highW, barH, 1, 1, "F");
    } else {
      doc.roundedRect(midX - highW, by, highW, barH, 1, 1, "F");
    }

    // Label
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(s.label, cx - 2, by + barH / 2 + 1.5, { align: "right" });
  });

  // Legend
  const legY = y + h - 3;
  doc.setFillColor(...GOLD);
  doc.rect(midX - 30, legY - 2, 5, 2.5, "F");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Favorable", midX - 24, legY);
  doc.setFillColor(...ORANGE);
  doc.rect(midX + 5, legY - 2, 5, 2.5, "F");
  doc.text("Unfavorable", midX + 11, legY);
}

function drawDonutChart(doc, cx, cy, radius, data, colors) {
  const total = data.reduce((s, v) => s + v, 0);
  let startAngle = -Math.PI / 2;
  const innerR = radius * 0.55;

  data.forEach((val, i) => {
    const sliceAngle = (val / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    const color = colors[i] || GOLD;

    // Draw arc segments using small line segments
    doc.setFillColor(...color);
    const steps = Math.max(8, Math.ceil(sliceAngle * 20));
    const points = [];
    // Outer arc
    for (let s = 0; s <= steps; s++) {
      const a = startAngle + (sliceAngle * s / steps);
      points.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
    }
    // Inner arc (reverse)
    for (let s = steps; s >= 0; s--) {
      const a = startAngle + (sliceAngle * s / steps);
      points.push({ x: cx + Math.cos(a) * innerR, y: cy + Math.sin(a) * innerR });
    }

    // Draw as triangles from first point
    for (let j = 1; j < points.length - 1; j++) {
      doc.triangle(
        points[0].x, points[0].y,
        points[j].x, points[j].y,
        points[j + 1].x, points[j + 1].y,
        "F"
      );
    }
    startAngle = endAngle;
  });
}

// ── Page check ───────────────────────────────────────────────────────────────
function checkPage(doc, y, needed, margin, pageH, addFooter) {
  if (y + needed > pageH - 20) {
    if (addFooter) addFooter(doc);
    doc.addPage();
    return 20;
  }
  return y;
}

// ── Main PDF generator ──────────────────────────────────────────────────────
// jsPDF built-in Helvetica only supports basic Latin chars; map safe symbols
const PDF_SAFE_SYMBOLS = new Set([..."$€£¥Fr"]);
const safeSym = (sym) => PDF_SAFE_SYMBOLS.has(sym) ? sym : sym.replace(/[^\x20-\x7E€£¥]/g, "") || sym;

export async function generateLcoeReport(p, R, sens, CAPEX_CATS, currOpts = {}) {
  const { currency = "USD", exchangeRate = 1 } = currOpts;
  // Use currency code as symbol in PDF if the symbol contains non-Latin chars
  const rawSym = currOpts.currSym || "$";
  const currSym = safeSym(rawSym) || currency;
  const cx = v => v * exchangeRate;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 0;

  const logoBase64 = await loadLogoBase64();

  // Header + Footer helper (applied to all pages at the end)
  const addHeaderFooter = (d) => {
    const pages = d.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      d.setPage(i);
      // ── Header: small logo left, tagline right ──
      if (logoBase64) {
        d.addImage(logoBase64, "PNG", margin, 5.5, 16, 8);
      } else {
        d.setFont("helvetica", "bold");
        d.setFontSize(8);
        d.setTextColor(...DARK);
        d.text("PVCopilot", margin, 10.5);
      }
      d.setFont("helvetica", "italic");
      d.setFontSize(7.5);
      d.setTextColor(...GRAY);
      d.text("Your Solar PV O&M Digital Assistant", pageW - margin, 10.5, { align: "right" });
      // thin separator line below header
      d.setDrawColor(226, 232, 240);
      d.setLineWidth(0.2);
      d.line(margin, 15, pageW - margin, 15);

      // ── Footer ──
      d.setFont("helvetica", "normal");
      d.setFontSize(8);
      d.setTextColor(...GRAY);
      d.text(`PVCopilot — LCOE Report  |  www.pvcopilot.com`, margin, pageH - 8);
      d.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 8, { align: "right" });
      d.setDrawColor(220, 220, 220);
      d.setLineWidth(0.2);
      d.line(margin, pageH - 12, pageW - margin, pageH - 12);
    }
  };

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  PAGE 1 — COVER / HERO                                                 ║
  // ╚══════════════════════════════════════════════════════════════════════════╝

  // Gold accent bar at top
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, pageW, 4, "F");

  // Logo
  y = 18;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y, 50, 25);
    y += 32;
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...DARK);
    doc.text("PVCopilot", margin, y + 8);
    y += 16;
  }

  // Title
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...DARK);
  doc.text("LCOE Analysis Report", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text(`Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, y);
  y += 4;
  doc.text(`System: ${fmt(p.systemCapacity, 0)} kWp · ${p.projectLifetime} year lifetime`, margin, y);

  // Divider
  y += 6;
  y = drawHR(doc, y, margin, pageW);

  // ── LCOE Hero Box ─────────────────────────────────────────────────────────
  y += 2;
  const lcoeMwh = R.lcoe * 1000;
  const lcoeColor = lcoeMwh > 45 ? RED : lcoeMwh < 34 ? GREEN : GOLD;
  const lcoeRating = lcoeMwh > 45 ? "Low" : lcoeMwh < 34 ? "Excellent" : "Rentable";

  // Background box
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(margin, y, contentW, 30, 3, 3, "F");
  doc.setDrawColor(...lcoeColor);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, contentW, 30, 3, 3, "S");

  // LCOE value
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...lcoeColor);
  doc.text(`${fmt(cx(R.lcoe), 4)} ${currency}/kWh`, margin + 8, y + 16);

  // Rating badge
  doc.setFontSize(10);
  doc.setTextColor(...lcoeColor);
  doc.text(`${lcoeRating}  ·  ${fmt(cx(lcoeMwh), 2)} ${currSym}/MWh`, margin + 8, y + 25);

  y += 38;

  // ── Key Performance Indicators ─────────────────────────────────────────────
  y = sectionHeader(doc, "Key Performance Indicators", y, margin);

  const kpiData = [
    ["Total CAPEX", `${currSym}${fmtK(cx(R.capexTotal))}`, `${fmt(cx(R.capexTotal / p.systemCapacity), 0)} ${currSym}/kWp`],
    ["Capacity Factor", `${fmt(R.capacityFactor, 2)}%`, `${fmt(R.lifeEnMWh, 0)} MWh lifetime`],
    ["Simple Payback", isFinite(R.simplePayback) ? `${fmt(R.simplePayback, 2)} yrs` : "—", `at ${fmt(cx(p.tariffPrice), 3)} ${currSym}/kWh`],
    ["Discounted Payback", R.discountedPayback ? `${fmt(R.discountedPayback, 1)} yrs` : "—", `at ${fmt(p.discountRate, 2)}% WACC`],
    ["IRR", R.irr ? `${fmt(R.irr, 2)}%` : "—", R.projectNpv >= 0 ? `NPV +${currSym}${fmtK(cx(R.projectNpv))}` : `NPV -${currSym}${fmtK(cx(Math.abs(R.projectNpv)))}`],
    ["LCOE (MWh)", `${currSym}${fmt(cx(lcoeMwh), 2)}/MWh`, lcoeRating],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value", "Detail"]],
    body: kpiData,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: 3.5,
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: DARK,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 45 },
      1: { halign: "center", cellWidth: 45 },
      2: { textColor: GRAY },
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── System Parameters ──────────────────────────────────────────────────────
  y = checkPage(doc, y, 80, margin + 10, pageH, null);
  y = sectionHeader(doc, "System Parameters", y, margin);

  const sysData = [
    ["System Capacity", `${fmt(p.systemCapacity, 1)} kWp`],
    ["Rated AC Power", `${fmt(p.ratedPowerAC, 1)} kWac`],
    ["DC/AC Ratio", `${fmt(p.dcAcRatio, 2)}`],
    ["Module Power", `${fmt(p.modulePower, 0)} Wp`],
    ["Specific Yield", `${fmt(p.specificYield, 0)} kWh/kWp/yr`],
    ["Annual Energy", `${fmt(p.annualEnergy, 0)} kWh/yr`],
    ["Performance Ratio", `${fmt(p.performanceRatio, 2)}%`],
    ["First Year Factor", `${fmt(p.firstYearFactor, 3)}`],
    ["Linear Degradation", `${fmt(p.linearDeg * 100, 2)}%/yr`],
    ["Project Lifetime", `${p.projectLifetime} years`],
    ["Discount Rate (WACC)", `${fmt(p.discountRate, 2)}%`],
    ["O&M Cost", `${fmt(cx(p.omPerKwp), 1)} ${currSym}/kWp/yr`],
    ["Tariff / PPA Rate", `${fmt(cx(p.tariffPrice), 3)} ${currSym}/kWh`],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Parameter", "Value"]],
    body: sysData,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: 3,
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 70 },
      1: { halign: "right" },
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  PAGE 2 — CAPEX BREAKDOWN                                               ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  doc.addPage();
  y = 20;

  y = sectionHeader(doc, "CAPEX Breakdown", y, margin);

  // Donut chart for CAPEX category shares
  const donutCX = margin + contentW / 4;
  const donutCY = y + 28;
  const donutR = 22;
  const catColors = [GOLD, BLUE, GREEN, ORANGE];
  drawDonutChart(doc, donutCX, donutCY, donutR, R.catTotals.map(c => c.localTotal), catColors);

  // Donut legend on the right
  let legY = y + 12;
  R.catTotals.forEach((c, i) => {
    doc.setFillColor(...catColors[i]);
    doc.rect(margin + contentW / 2 + 4, legY - 2.5, 4, 4, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(c.label, margin + contentW / 2 + 11, legY + 0.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(`${currSym}${fmtK(cx(c.localTotal))}  (${fmt((c.localTotal / R.capexTotal) * 100, 1)}%)`, margin + contentW / 2 + 11, legY + 5);
    legY += 12;
  });
  y += 60;

  // Category summary
  const catSummary = R.catTotals.map((c) => [
    c.label,
    `${fmt(cx(c.usdKwp), 1)} ${currSym}/kWp`,
    `${currSym}${fmtK(cx(c.localTotal))}`,
    `${fmt((c.localTotal / R.capexTotal) * 100, 1)}%`,
  ]);
  catSummary.push([
    "TOTAL",
    `${fmt(cx(R.capexTotal / p.systemCapacity), 1)} ${currSym}/kWp`,
    `${currSym}${fmtK(cx(R.capexTotal))}`,
    "100.0%",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Category", `${currSym}/kWp`, "Total Cost", "Share"]],
    body: catSummary,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: 3.5,
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: "bold" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "center" },
    },
    didParseCell: (data) => {
      if (data.row.index === catSummary.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Detailed CAPEX items per category
  y = checkPage(doc, y, 60, margin + 10, pageH, null);
  y = sectionHeader(doc, "Detailed CAPEX Items", y, margin);

  for (const cat of CAPEX_CATS) {
    y = checkPage(doc, y, 30, margin + 10, pageH, null);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(cat.label, margin, y);
    y += 5;

    const items = cat.items.map((item) => [
      item.label,
      `${fmt(cx(p.capex[item.id] || 0), 1)} ${currSym}/kWp`,
      `${currSym}${fmtK(cx((p.capex[item.id] || 0) * p.systemCapacity))}`,
    ]);

    const catTotal = cat.items.reduce((s, i) => s + (p.capex[i.id] || 0), 0);
    items.push(["Subtotal", `${fmt(cx(catTotal), 1)} ${currSym}/kWp`, `${currSym}${fmtK(cx(catTotal * p.systemCapacity))}`]);

    autoTable(doc, {
      startY: y,
      body: items,
      margin: { left: margin + 4, right: margin },
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 2.5,
        textColor: DARK,
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: [252, 250, 245] },
      columnStyles: {
        0: { cellWidth: 65 },
        1: { halign: "right", cellWidth: 35 },
        2: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.row.index === items.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [245, 245, 240];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  PAGE 3 — CASH FLOW & ENERGY                                            ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  doc.addPage();
  y = 20;

  y = sectionHeader(doc, "Energy Production Profile", y, margin);

  // Energy line chart
  const energyMWhData = R.rows.map(r => r.energyMWh);
  const discCostData = R.rows.map(r => r.discCost);
  drawLineChart(doc, margin, y, contentW, 55, [energyMWhData, discCostData], {
    colors: [GOLD, BLUE],
    labels: ["Energy (MWh)", "Disc. O&M ($)"],
    xLabel: "Year",
    showArea: true,
    dualAxis: true,
  });
  y += 60;

  // Energy table on a new page so all rows fit
  doc.addPage();
  y = 20;
  y = sectionHeader(doc, "Energy Production Profile — Data", y, margin);

  // Show ALL rows — adapt font size and padding to fit on one page
  const energyRows = R.rows;
  const showRows = energyRows.map((r) => [
    `Year ${r.year}`,
    `${fmt(r.energyMWh, 1)} MWh`,
    `${fmt(r.degF, 1)}%`,
    `${currSym}${fmtK(cx(r.discCost))}`,
  ]);

  // Available space on page (subtract header area + bottom margin)
  const availH = pageH - y - 20;
  // Estimate row height: fontSize * 0.35 + cellPadding * 2
  // Scale down for large tables to fit in one page
  const rowCount = showRows.length + 1; // +1 for header
  const targetRowH = availH / rowCount;
  const energyFontSize = Math.max(6, Math.min(9, targetRowH / 1.1));
  const energyPadding = Math.max(1, Math.min(3, (targetRowH - energyFontSize * 0.35) / 2));

  autoTable(doc, {
    startY: y,
    head: [["Period", "Energy Output", "Degradation Factor", "Disc. O&M Cost"]],
    body: showRows,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: energyFontSize,
      cellPadding: energyPadding,
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: energyFontSize },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 25 },
      1: { halign: "right" },
      2: { halign: "center" },
      3: { halign: "right" },
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Cash Flow Chart ──────────────────────────────────────────────────────
  doc.addPage();
  y = 20;
  y = sectionHeader(doc, "Cash Flow Analysis", y, margin);

  // Bar chart: revenue vs opex per year
  const cfRevData = R.cashFlowRows.map(r => r.discountedRevenue);
  const cfYears = R.cashFlowRows.map(r => `${r.year}`);
  drawBarChart(doc, margin, y, contentW, 55, cfYears, cfRevData, {
    colors: cfRevData.map(() => GREEN),
  });
  // Overlay cumulative line
  const cfCumData = R.cashFlowRows.map(r => r.cumulativeDiscountedCashFlow);
  y += 58;

  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text("Bars: Discounted Revenue per year", margin + 4, y);
  y += 6;

  // Cumulative cash flow line chart
  drawLineChart(doc, margin, y, contentW, 50, [cfCumData], {
    colors: [BLUE],
    labels: ["Cumulative Disc. Cash Flow ($)"],
    xLabel: "Year",
    showArea: true,
  });
  y += 55;

  // ── Cash Flow Table ──────────────────────────────────────────────────────
  doc.addPage();
  y = 20;
  y = sectionHeader(doc, "Cash Flow Analysis — Data", y, margin);

  const cfRows = R.cashFlowRows;
  const cfShow = cfRows.map((r) => [
    `Year ${r.year}`,
    `${currSym}${fmtK(cx(r.discountedRevenue))}`,
    `${currSym}${fmtK(cx(Math.abs(r.discountedOpex)))}`,
    `${currSym}${fmtK(cx(r.discountedNetCashFlow))}`,
    `${currSym}${fmtK(cx(r.cumulativeDiscountedCashFlow))}`,
  ]);

  // Adapt font size and padding to fit all rows on one page
  const cfAvailH = pageH - y - 20;
  const cfRowCount = cfShow.length + 1; // +1 for header
  const cfTargetRowH = cfAvailH / cfRowCount;
  const cfFontSize = Math.max(6, Math.min(8.5, cfTargetRowH / 1.1));
  const cfPadding = Math.max(1, Math.min(2.8, (cfTargetRowH - cfFontSize * 0.35) / 2));

  autoTable(doc, {
    startY: y,
    head: [["Period", "Disc. Revenue", "Disc. OPEX", "Disc. Net CF", "Cumulative CF"]],
    body: cfShow,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: cfFontSize,
      cellPadding: cfPadding,
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: cfFontSize },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 25 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  SENSITIVITY ANALYSIS                                                    ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
  y = checkPage(doc, y, 80, margin + 10, pageH, null);
  if (y < 30) y = 20;
  y = sectionHeader(doc, "Sensitivity Analysis", y, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("LCOE variation when each parameter changes by +/-20%", margin, y);
  y += 7;

  // Tornado chart
  drawTornadoChart(doc, margin, y, contentW, Math.min(65, 10 + sens.length * 10), sens);
  y += Math.min(65, 10 + sens.length * 10) + 6;

  y = checkPage(doc, y, 50, margin + 10, pageH, null);

  const sensData = sens.map((s) => [
    s.label,
    `${s.low > 0 ? "+" : ""}${fmt(s.low, 4)}`,
    `${s.high > 0 ? "+" : ""}${fmt(s.high, 4)}`,
    `${fmt(s.swing, 4)}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Parameter", "Favorable (-20%)", "Unfavorable (+20%)", "Total Swing"]],
    body: sensData,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: 3.5,
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center", fontStyle: "bold" },
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── LCOE Methodology ──────────────────────────────────────────────────────
  y = checkPage(doc, y, 55, margin + 10, pageH, null);
  if (y < 30) y = 20;
  y = sectionHeader(doc, "Methodology", y, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);

  const methodLines = [
    "LCOE Formula:",
    "  LCOE = Sum(Cost_t / (1+r)^t) / Sum(E_t / (1+r)^t)",
    "",
    "Energy Model:",
    `  E_0 = ${fmt(p.annualEnergy, 0)} kWh/yr (year 0, no degradation)`,
    `  E_t = E_0 x (${fmt(p.firstYearFactor, 3)} - ${fmt(p.linearDeg, 4)} x t), for t >= 1`,
    "",
    "Cost Model:",
    `  Cost_0 = CAPEX = ${currSym}${fmtK(cx(R.capexTotal))}`,
    `  Cost_t = O&M = ${currSym}${fmtK(cx(R.omAnnual))}/yr (constant)`,
    "",
    "Discounting:",
    `  r = WACC = ${fmt(p.discountRate, 2)}%`,
    `  NPV of all costs = ${currSym}${fmtK(cx(R.totalDiscC))}`,
    `  Discounted energy = ${fmtK(R.totalDiscE)} kWh`,
  ];

  methodLines.forEach((line) => {
    y = checkPage(doc, y, 5, margin + 10, pageH, null);
    if (line.startsWith("  ")) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
    } else if (line === "") {
      y += 1;
      return;
    } else {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
    }
    doc.text(line, margin + 2, y);
    y += 4.5;
  });

  // ── Disclaimer ─────────────────────────────────────────────────────────────
  y += 8;
  y = checkPage(doc, y, 20, margin + 10, pageH, null);
  y = drawHR(doc, y, margin, pageW);
  y += 2;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  const disclaimer =
    "This report is generated by PVCopilot for preliminary analysis purposes. Results are based on user-provided inputs and simplified financial models. Actual project economics may vary. Consult a qualified engineer and financial advisor for investment decisions.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentW);
  doc.text(disclaimerLines, margin, y);

  // ── Apply header + footer to all pages ─────────────────────────────────────
  addHeaderFooter(doc);

  // ── Download ───────────────────────────────────────────────────────────────
  doc.save(`PVCopilot_LCOE_Report_${fmt(p.systemCapacity, 0)}kWp.pdf`);
}
