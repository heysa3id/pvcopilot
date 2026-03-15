import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import './index.css'
import Navbar from './components/Navbar'
import LandingPage from './pages/LandingPage'
import LcoeTool from './pages/LcoeTool'
import PlaceholderPage from './pages/PlaceholderPage'
import DataIngestionPage from './pages/QualityCheckPage'
import DataFilteringPage from './pages/DataFilteringPage'
import QueryStats from '@mui/icons-material/QueryStats'
import AutoFixHigh from '@mui/icons-material/AutoFixHigh'
import ElectricBolt from '@mui/icons-material/ElectricBolt'

const ICON_COLOR = "#FFB800";
function KpiAnalysisPage() {
  return (
    <PlaceholderPage
      icon={<QueryStats sx={{ fontSize: 40, color: ICON_COLOR }} />}
      title="KPI Analysis" color="#16a34a"
      desc="IEC 61724 performance metrics: PR, capacity factor, degradation rate, and yield ratios."
    />
  )
}
function GapFillingPage() {
  return (
    <PlaceholderPage
      icon={<AutoFixHigh sx={{ fontSize: 40, color: ICON_COLOR }} />}
      title="Gap Filling" color="#059669"
      desc="ML-based missing data recovery with historical pattern matching and uncertainty bounds."
    />
  )
}
function PowerPredictionPage() {
  return (
    <PlaceholderPage
      icon={<ElectricBolt sx={{ fontSize: 40, color: ICON_COLOR }} />}
      title="Power Prediction" color="#ff7a45"
      desc="Physical + ML energy forecasting with performance comparison and loss analysis."
    />
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <Navbar />
      <div style={{ paddingTop: 56 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/data-ingestion" element={<DataIngestionPage />} />
          <Route path="/kpi-analysis" element={<KpiAnalysisPage />} />
          <Route path="/gap-filling" element={<GapFillingPage />} />
          <Route path="/power-prediction" element={<PowerPredictionPage />} />
          <Route path="/data-filtering" element={<DataFilteringPage />} />
          <Route path="/lcoe-tool" element={<LcoeTool />} />
        </Routes>
      </div>
    </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
