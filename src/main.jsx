// Safari/WebKit: polyfill must run before any code that uses Promise.withResolvers (e.g. pdfjs)
import './utils/promiseWithResolversPolyfill.js'
import { rewriteGithubPagesSpaUrl } from './utils/rewriteGithubPagesSpaUrl.js'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import './index.css'
import Navbar from './components/Navbar'
import { GoogleAnalytics } from './components/GoogleAnalytics'
import LandingPage from './pages/LandingPage'
import LcoeTool from './pages/LcoeTool'
import DocsPage from './pages/DocsPage'
import PlaceholderPage from './pages/PlaceholderPage'
import DataIngestionPage from './pages/QualityCheckPage'
import DataFilteringPage from './pages/DataFilteringPage'
import KpiAnalysisPage from './pages/KpiAnalysisPage'
import AutoFixHigh from '@mui/icons-material/AutoFixHigh'
import ElectricBolt from '@mui/icons-material/ElectricBolt'
import AccountTree from '@mui/icons-material/AccountTree'

const ICON_COLOR = "#FFB800";

function GapFillingPage() {
  const color = "#059669";
  const cardStyle = {
    maxWidth: 1000,
    width: "100%",
    background: "#FFFFFF",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)",
    border: "1px solid #E2E8F0",
    overflow: "hidden",
    padding: 24,
  };
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: "#FAFBFC",
        fontFamily: "Inter, Arial, sans-serif",
        paddingBottom: 48,
      }}
    >
      {/* Header block */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 40,
          paddingBottom: 32,
        }}
      >
        <div style={{ textAlign: "center", padding: "0 24px", maxWidth: 460 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: `${color}12`,
              border: `2px solid ${color}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <AutoFixHigh sx={{ fontSize: 40, color: ICON_COLOR }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
            Gap Filling
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 32, lineHeight: 1.6 }}>
            ML-based missing data recovery with historical pattern matching and uncertainty bounds.
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              background: `${color}12`,
              border: `1.5px solid ${color}40`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              color: color,
            }}
          >
            Module in development
          </div>
          <div style={{ marginTop: 24 }}>
            <Link to="/" style={{ fontSize: 13, color: "#64748B", textDecoration: "none" }}>
              ← Back to Overview
            </Link>
          </div>
        </div>
      </div>

      {/* Image below */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 24px",
        }}
      >
        <div style={cardStyle}>
          <img
            src="/gap-filling-sample.png"
            alt="Gaps filling sample: output power (W) with real values, data with gaps, and imputations (December and November 2022)"
            style={{ width: "100%", height: "auto", display: "block", objectFit: "contain" }}
          />
        </div>
      </div>
    </div>
  )
}
function WorkflowPage() {
  const color = "#0ea5e9";
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: "#FAFBFC",
        fontFamily: "Inter, Arial, sans-serif",
        paddingBottom: 48,
      }}
    >
      {/* Header block (same as placeholder) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 40,
          paddingBottom: 32,
        }}
      >
        <div style={{ textAlign: "center", padding: "0 24px", maxWidth: 460 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: `${color}12`,
              border: `2px solid ${color}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <AccountTree sx={{ fontSize: 40, color: ICON_COLOR }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
            Workflow
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 32, lineHeight: 1.6 }}>
            End-to-end data and model workflow orchestration with configurable steps and monitoring.
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              background: `${color}12`,
              border: `1.5px solid ${color}40`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              color: color,
            }}
          >
            Module in development
          </div>
          <div style={{ marginTop: 24 }}>
            <Link to="/" style={{ fontSize: 13, color: "#64748B", textDecoration: "none" }}>
              ← Back to Overview
            </Link>
          </div>
        </div>
      </div>

      {/* Workflow diagram below */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1000,
            width: "100%",
            background: "#FFFFFF",
            borderRadius: 16,
            boxShadow: "0 4px 24px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)",
            border: "1px solid #E2E8F0",
            overflow: "hidden",
            padding: 24,
          }}
        >
          <img
            src="/pipeline-diagram.png"
            alt="PV data processing and analysis workflow: from outdoor field and data acquisition through synchronization, filtering, gap filling, KPI calculation, performance prediction to system report"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              objectFit: "contain",
            }}
          />
        </div>
      </div>
    </div>
  )
}
function PowerPredictionPage() {
  const color = "#ff7a45";
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: "#FAFBFC",
        fontFamily: "Inter, Arial, sans-serif",
        paddingBottom: 48,
      }}
    >
      {/* Header block */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 40,
          paddingBottom: 32,
        }}
      >
        <div style={{ textAlign: "center", padding: "0 24px", maxWidth: 460 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: `${color}12`,
              border: `2px solid ${color}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <ElectricBolt sx={{ fontSize: 40, color: ICON_COLOR }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
            Power Prediction
          </h1>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 32, lineHeight: 1.6 }}>
            Physical + ML energy forecasting with performance comparison and loss analysis.
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              background: `${color}12`,
              border: `1.5px solid ${color}40`,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              color: color,
            }}
          >
            Module in development
          </div>
          <div style={{ marginTop: 24 }}>
            <Link to="/" style={{ fontSize: 13, color: "#64748B", textDecoration: "none" }}>
              ← Back to Overview
            </Link>
          </div>
        </div>
      </div>

      {/* Image below */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            maxWidth: 1000,
            width: "100%",
            background: "#FFFFFF",
            borderRadius: 16,
            boxShadow: "0 4px 24px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)",
            border: "1px solid #E2E8F0",
            overflow: "hidden",
            padding: 24,
          }}
        >
          <img
            src="/power-prediction-backtest.png"
            alt="Backtest: PR (Holdout) — Performance Ratio true vs predicted values over time"
            style={{ width: "100%", height: "auto", display: "block", objectFit: "contain" }}
          />
        </div>
      </div>
    </div>
  )
}

const theme = createTheme({
  typography: {
    fontFamily: '"Inter", Arial, sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { fontWeight: 600 },
    body1: { fontWeight: 400 },
    body2: { fontWeight: 400 },
    caption: { fontWeight: 500 },
  },
})

rewriteGithubPagesSpaUrl()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <GoogleAnalytics />
        <Navbar />
      <div style={{ paddingTop: 56 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/data-ingestion" element={<DataIngestionPage />} />
          <Route path="/kpi-analysis" element={<KpiAnalysisPage />} />
          <Route path="/gap-filling" element={<GapFillingPage />} />
          <Route path="/workflow" element={<WorkflowPage />} />
          <Route path="/power-prediction" element={<PowerPredictionPage />} />
          <Route path="/data-filtering" element={<DataFilteringPage />} />
          <Route path="/lcoe-tool" element={<LcoeTool />} />
        </Routes>
      </div>
    </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
