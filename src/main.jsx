import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Navbar from './components/Navbar'
import LandingPage from './pages/LandingPage'
import LcoeTool from './pages/LcoeTool'
import PlaceholderPage from './pages/PlaceholderPage'
import QualityCheckPage from './pages/QualityCheckPage'
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Navbar />
      <div style={{ paddingTop: 56 }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/quality-check" element={<QualityCheckPage />} />
          <Route path="/kpi-analysis" element={<KpiAnalysisPage />} />
          <Route path="/gap-filling" element={<GapFillingPage />} />
          <Route path="/power-prediction" element={<PowerPredictionPage />} />
          <Route path="/lcoe-tool" element={<LcoeTool />} />
        </Routes>
      </div>
    </HashRouter>
  </React.StrictMode>,
)
