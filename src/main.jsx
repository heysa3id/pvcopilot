import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Navbar from './components/Navbar'
import LandingPage from './pages/LandingPage'
import LcoeTool from './pages/LcoeTool'
import PlaceholderPage from './pages/PlaceholderPage'
import DataIngestionPage from './pages/QualityCheckPage'
import QueryStats from '@mui/icons-material/QueryStats'
import AutoFixHigh from '@mui/icons-material/AutoFixHigh'
import ElectricBolt from '@mui/icons-material/ElectricBolt'
import FilterAltOutlined from '@mui/icons-material/FilterAltOutlined'

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
function DataFilteringPage() {
  return (
    <PlaceholderPage
      icon={<FilterAltOutlined sx={{ fontSize: 40, color: ICON_COLOR }} />}
      title="Data Filtering" color="#e11d48"
      desc="Module under development."
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
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
  </React.StrictMode>,
)
