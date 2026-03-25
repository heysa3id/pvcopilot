import { jsPDF } from "jspdf";
import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("output/pdf/pvcopilot-app-summary.pdf");

const doc = new jsPDF({
  orientation: "portrait",
  unit: "pt",
  format: "letter",
  compress: true,
});

const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 34;
const gutter = 16;
const colWidth = (pageWidth - margin * 2 - gutter) / 2;

const colors = {
  gold: [255, 184, 0],
  slate: [15, 23, 42],
  blue: [29, 155, 240],
  green: [22, 163, 74],
  gray: [100, 116, 139],
  border: [226, 232, 240],
  bg: [248, 250, 252],
  white: [255, 255, 255],
};

function setFill(rgb) {
  doc.setFillColor(...rgb);
}

function setDraw(rgb) {
  doc.setDrawColor(...rgb);
}

function setText(rgb) {
  doc.setTextColor(...rgb);
}

function drawHeader() {
  setFill(colors.bg);
  doc.roundedRect(margin, margin, pageWidth - margin * 2, 72, 14, 14, "F");
  setDraw(colors.border);
  doc.roundedRect(margin, margin, pageWidth - margin * 2, 72, 14, 14, "S");

  setFill(colors.gold);
  doc.roundedRect(margin + 16, margin + 16, 54, 40, 10, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  setText(colors.slate);
  doc.text("PVCopilot", margin + 84, margin + 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  setText(colors.gray);
  doc.text("App Summary", margin + 84, margin + 48);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  setText(colors.slate);
  doc.text("PV", margin + 28, margin + 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setText(colors.gray);
  doc.text("Repo-based overview", pageWidth - margin - 100, margin + 48);
}

function sectionTitle(x, y, title, accent = colors.blue) {
  setFill(accent);
  doc.circle(x + 4, y - 3, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  setText(colors.slate);
  doc.text(title, x + 12, y);
  return y + 6;
}

function drawParagraphBox(x, y, w, title, lines, minHeight = 80, accent = colors.blue) {
  const lineHeight = 12;
  let textHeight = 0;
  const wrapped = lines.flatMap((line) => doc.splitTextToSize(line, w - 22));
  textHeight = wrapped.length * lineHeight;
  const height = Math.max(minHeight, 22 + textHeight + 12);

  setFill(colors.white);
  doc.roundedRect(x, y, w, height, 10, 10, "F");
  setDraw(colors.border);
  doc.roundedRect(x, y, w, height, 10, 10, "S");

  let cursorY = sectionTitle(x + 12, y + 18, title, accent) + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  setText(colors.slate);
  for (const line of wrapped) {
    doc.text(line, x + 12, cursorY);
    cursorY += lineHeight;
  }
  return y + height;
}

function drawBulletsBox(x, y, w, title, bullets, accent = colors.green) {
  const lineHeight = 10.5;
  let rows = [];
  for (const bullet of bullets) {
    const wrapped = doc.splitTextToSize(bullet, w - 34);
    rows.push(wrapped);
  }
  const textHeight = rows.reduce((sum, item) => sum + item.length * lineHeight + 2, 0);
  const height = 28 + textHeight + 12;

  setFill(colors.white);
  doc.roundedRect(x, y, w, height, 10, 10, "F");
  setDraw(colors.border);
  doc.roundedRect(x, y, w, height, 10, 10, "S");

  let cursorY = sectionTitle(x + 12, y + 18, title, accent) + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.9);
  setText(colors.slate);
  for (const wrapped of rows) {
    setFill(accent);
    doc.circle(x + 17, cursorY - 3.5, 1.7, "F");
    doc.text(wrapped[0], x + 25, cursorY);
    cursorY += lineHeight;
    for (let i = 1; i < wrapped.length; i++) {
      doc.text(wrapped[i], x + 25, cursorY);
      cursorY += lineHeight;
    }
    cursorY += 2;
  }
  return y + height;
}

function drawFooter() {
  const y = pageHeight - 24;
  setDraw(colors.border);
  doc.line(margin, y - 10, pageWidth - margin, y - 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  setText(colors.gray);
  doc.text(
    "Evidence used: src/main.jsx, src/pages/LandingPage.jsx, src/pages/QualityCheckPage.jsx, src/pages/DataFilteringPage.jsx, src/pages/KpiAnalysisPage.jsx, src/pages/LcoeTool.jsx, backend/server.py, DEPLOY.md, package.json",
    margin,
    y,
    { maxWidth: pageWidth - margin * 2 }
  );
}

drawHeader();

const leftX = margin;
const rightX = margin + colWidth + gutter;
let leftY = margin + 88;
let rightY = margin + 88;

leftY = drawParagraphBox(leftX, leftY, colWidth, "What It Is", [
  "PVCopilot is a React and Vite web app for solar PV data analysis and project economics.",
  "The repo implements data ingestion, filtering, KPI analysis, documentation, and an LCOE workflow, while gap filling, workflow chaining, and power prediction are shown as modules in development."
], 104, colors.blue);

leftY += 12;
leftY = drawParagraphBox(leftX, leftY, colWidth, "Who It Is For", [
  "Primary persona: solar PV O&M engineers and performance analysts.",
  "The landing page also calls out O&M teams, analysts, and decision-makers working on PV assets."
], 86, colors.green);

leftY += 12;
drawBulletsBox(leftX, leftY, colWidth, "What It Does", [
  "Imports PV CSV, weather CSV, and system JSON template data.",
  "Runs ingestion and sync checks for timestamps, gaps, sensor issues, and outliers.",
  "Applies custom data filtering and preprocessing for PV time-series.",
  "Calculates IEC 61724-aligned KPIs such as PR, yield, capacity factor, and degradation.",
  "Parses PVsyst reports and computes LCOE, CAPEX, NPV, IRR, payback, and sensitivity charts.",
  "Provides in-app documentation, PDF report export, and a contact capture form."
], colors.gold);

rightY = drawParagraphBox(rightX, rightY, colWidth, "How It Works", [
  "Frontend: React 19 SPA with BrowserRouter in src/main.jsx. Implemented routes include /data-ingestion, /data-filtering, /kpi-analysis, /lcoe-tool, /docs, and the landing page.",
  "Shared UI and parsing helpers live in components such as Navbar, CSVColumnMapper, TableColumnSelector, and SystemInfoHelpIcon.",
  "LCOE uses client utilities for jsPDF export and a browser-side PVsyst parser fallback when the backend is unavailable.",
  "Backend: Flask API on port 5001 exposes /api/process-csv, /api/parse-pvsyst, /api/contact, /api/contacts, and /api/health.",
  "Data flow: user uploads files in the browser, pages parse or validate locally, selected flows POST to Flask for processing, responses return JSON, and the frontend renders charts, tables, or PDF output."
], 254, colors.blue);

rightY += 12;
drawBulletsBox(rightX, rightY, colWidth, "How To Run", [
  "Install frontend deps: npm install",
  "Create Python env and install backend deps: python3 -m venv .venv, then .venv/bin/pip install -r backend/requirements.txt",
  "Start the Flask API: npm run backend",
  "Start the Vite frontend in another shell: npm run dev",
  "Open the local app; frontend defaults expect the API at http://localhost:5001"
], colors.green);

drawFooter();

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
doc.save(outputPath);
console.log(outputPath);
