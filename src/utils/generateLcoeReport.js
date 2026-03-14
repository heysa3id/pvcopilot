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

// ── Page check ───────────────────────────────────────────────────────────────
function checkPage(doc, y, needed, margin, pageH, addFooter) {
  if (y + needed > pageH - 20) {
    if (addFooter) addFooter(doc);
    doc.addPage();
    return margin + 10;
  }
  return y;
}

// ── Main PDF generator ──────────────────────────────────────────────────────
export async function generateLcoeReport(p, R, sens, CAPEX_CATS) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 0;

  const logoBase64 = await loadLogoBase64();

  // Footer helper
  const addFooter = (d) => {
    const pages = d.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      d.setPage(i);
      d.setFontSize(8);
      d.setTextColor(...GRAY);
      d.text(`PVCopilot — LCOE Report`, margin, pageH - 8);
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
  doc.text(`${fmt(R.lcoe, 4)} USD/kWh`, margin + 8, y + 16);

  // Rating badge
  doc.setFontSize(10);
  doc.setTextColor(...lcoeColor);
  doc.text(`${lcoeRating}  ·  ${fmt(lcoeMwh, 2)} $/MWh`, margin + 8, y + 25);

  y += 38;

  // ── Key Performance Indicators ─────────────────────────────────────────────
  y = sectionHeader(doc, "Key Performance Indicators", y, margin);

  const kpiData = [
    ["Total CAPEX", `$${fmtK(R.capexTotal)}`, `${fmt(R.capexTotal / p.systemCapacity, 0)} $/kWp`],
    ["Capacity Factor", `${fmt(R.capacityFactor, 2)}%`, `${fmt(R.lifeEnMWh, 0)} MWh lifetime`],
    ["Simple Payback", isFinite(R.simplePayback) ? `${fmt(R.simplePayback, 2)} yrs` : "—", `at ${fmt(p.tariffPrice, 3)} $/kWh`],
    ["Discounted Payback", R.discountedPayback ? `${fmt(R.discountedPayback, 1)} yrs` : "—", `at ${fmt(p.discountRate, 2)}% WACC`],
    ["IRR", R.irr ? `${fmt(R.irr, 2)}%` : "—", R.projectNpv >= 0 ? `NPV +$${fmtK(R.projectNpv)}` : `NPV -$${fmtK(Math.abs(R.projectNpv))}`],
    ["LCOE (MWh)", `$${fmt(lcoeMwh, 2)}/MWh`, lcoeRating],
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
    ["O&M Cost", `${fmt(p.omPerKwp, 1)} $/kWp/yr`],
    ["Tariff / PPA Rate", `${fmt(p.tariffPrice, 3)} $/kWh`],
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
  y = 14;

  // Gold accent bar
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, pageW, 3, "F");
  y += 4;

  y = sectionHeader(doc, "CAPEX Breakdown", y, margin);

  // Category summary
  const catSummary = R.catTotals.map((c) => [
    c.label,
    `${fmt(c.usdKwp, 1)} $/kWp`,
    `$${fmtK(c.localTotal)}`,
    `${fmt((c.localTotal / R.capexTotal) * 100, 1)}%`,
  ]);
  catSummary.push([
    "TOTAL",
    `${fmt(R.capexTotal / p.systemCapacity, 1)} $/kWp`,
    `$${fmtK(R.capexTotal)}`,
    "100.0%",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Category", "$/kWp", "Total Cost", "Share"]],
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
      `${fmt(p.capex[item.id] || 0, 1)} $/kWp`,
      `$${fmtK((p.capex[item.id] || 0) * p.systemCapacity)}`,
    ]);

    const catTotal = cat.items.reduce((s, i) => s + (p.capex[i.id] || 0), 0);
    items.push(["Subtotal", `${fmt(catTotal, 1)} $/kWp`, `$${fmtK(catTotal * p.systemCapacity)}`]);

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
  y = 14;
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, pageW, 3, "F");
  y += 4;

  y = sectionHeader(doc, "Energy Production Profile", y, margin);

  // Show first 5 + last 5 rows for brevity
  const energyRows = R.rows;
  const showRows = [];
  if (energyRows.length <= 12) {
    energyRows.forEach((r) =>
      showRows.push([
        `Year ${r.year}`,
        `${fmt(r.energyMWh, 1)} MWh`,
        `${fmt(r.degF, 1)}%`,
        `$${fmtK(r.discCost)}`,
      ])
    );
  } else {
    for (let i = 0; i < 5; i++) {
      const r = energyRows[i];
      showRows.push([
        `Year ${r.year}`,
        `${fmt(r.energyMWh, 1)} MWh`,
        `${fmt(r.degF, 1)}%`,
        `$${fmtK(r.discCost)}`,
      ]);
    }
    showRows.push(["...", "...", "...", "..."]);
    for (let i = energyRows.length - 5; i < energyRows.length; i++) {
      const r = energyRows[i];
      showRows.push([
        `Year ${r.year}`,
        `${fmt(r.energyMWh, 1)} MWh`,
        `${fmt(r.degF, 1)}%`,
        `$${fmtK(r.discCost)}`,
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Period", "Energy Output", "Degradation Factor", "Disc. O&M Cost"]],
    body: showRows,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 30 },
      1: { halign: "right" },
      2: { halign: "center" },
      3: { halign: "right" },
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Cash Flow Summary ──────────────────────────────────────────────────────
  y = checkPage(doc, y, 70, margin + 10, pageH, null);
  y = sectionHeader(doc, "Cash Flow Analysis", y, margin);

  const cfRows = R.cashFlowRows;
  const cfShow = [];
  if (cfRows.length <= 12) {
    cfRows.forEach((r) =>
      cfShow.push([
        `Year ${r.year}`,
        `$${fmtK(r.discountedRevenue)}`,
        `$${fmtK(Math.abs(r.discountedOpex))}`,
        `$${fmtK(r.discountedNetCashFlow)}`,
        `$${fmtK(r.cumulativeDiscountedCashFlow)}`,
      ])
    );
  } else {
    for (let i = 0; i < 5; i++) {
      const r = cfRows[i];
      cfShow.push([
        `Year ${r.year}`,
        `$${fmtK(r.discountedRevenue)}`,
        `$${fmtK(Math.abs(r.discountedOpex))}`,
        `$${fmtK(r.discountedNetCashFlow)}`,
        `$${fmtK(r.cumulativeDiscountedCashFlow)}`,
      ]);
    }
    cfShow.push(["...", "...", "...", "...", "..."]);
    for (let i = cfRows.length - 5; i < cfRows.length; i++) {
      const r = cfRows[i];
      cfShow.push([
        `Year ${r.year}`,
        `$${fmtK(r.discountedRevenue)}`,
        `$${fmtK(Math.abs(r.discountedOpex))}`,
        `$${fmtK(r.discountedNetCashFlow)}`,
        `$${fmtK(r.cumulativeDiscountedCashFlow)}`,
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [["Period", "Disc. Revenue", "Disc. OPEX", "Disc. Net CF", "Cumulative CF"]],
    body: cfShow,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.8,
      textColor: DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
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
  if (y < 30) {
    doc.setFillColor(...GOLD);
    doc.rect(0, 0, pageW, 3, "F");
    y = 18;
  }
  y = sectionHeader(doc, "Sensitivity Analysis", y, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("LCOE variation when each parameter changes by +/-20%", margin, y);
  y += 7;

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
  if (y < 30) {
    doc.setFillColor(...GOLD);
    doc.rect(0, 0, pageW, 3, "F");
    y = 18;
  }
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
    `  Cost_0 = CAPEX = $${fmtK(R.capexTotal)}`,
    `  Cost_t = O&M = $${fmtK(R.omAnnual)}/yr (constant)`,
    "",
    "Discounting:",
    `  r = WACC = ${fmt(p.discountRate, 2)}%`,
    `  NPV of all costs = $${fmtK(R.totalDiscC)}`,
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

  // ── Apply footer to all pages ──────────────────────────────────────────────
  addFooter(doc);

  // ── Download ───────────────────────────────────────────────────────────────
  doc.save(`PVCopilot_LCOE_Report_${fmt(p.systemCapacity, 0)}kWp.pdf`);
}
