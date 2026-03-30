import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** PV estimator weather + CEC lookup APIs (public/pv-estimator-app/server.js). */
const PV_ESTIMATOR_API = process.env.PV_ESTIMATOR_API_URL || "http://127.0.0.1:4173";

/** Serve public/pv-estimator-app/index.html at /pv-estimator-app/ (no index.html in URL). */
function pvEstimatorAppCleanUrl() {
  const apply = (server) => {
    const raw = server.config.base || "/"
    const basePath = raw === "/" ? "" : raw.replace(/\/$/, "")
    const segment = `${basePath}/pv-estimator-app`
    server.middlewares.use((req, res, next) => {
      const q = req.url.indexOf("?")
      const pathname = q === -1 ? req.url : req.url.slice(0, q)
      const search = q === -1 ? "" : req.url.slice(q)
      if (pathname === segment) {
        res.statusCode = 302
        res.setHeader("Location", `${segment}/${search}`)
        res.end()
        return
      }
      if (pathname === `${segment}/` || pathname === `${segment}/index.html`) {
        req.url = `${segment}/index.html${search}`
      }
      next()
    })
  }
  return {
    name: "pv-estimator-clean-url",
    configureServer: apply,
    configurePreviewServer: apply,
  }
}

/** After build, inject VITE_API_BASE into dist/pv-estimator-app for production API calls. */
function injectPvEstimatorApiBase() {
  return {
    name: "inject-pv-estimator-api-base",
    closeBundle() {
      const distHtml = path.resolve(__dirname, "dist/pv-estimator-app/index.html")
      if (!fs.existsSync(distHtml)) {
        return
      }
      let html = fs.readFileSync(distHtml, "utf8")
      const injected = JSON.stringify(process.env.VITE_API_BASE || "")
      const next = html.replace(
        /window\.__PV_ESTIMATOR_API_BASE__\s*=\s*""\s*;/,
        `window.__PV_ESTIMATOR_API_BASE__ = ${injected};`
      )
      if (next === html) {
        return
      }
      fs.writeFileSync(distHtml, next)
    },
  }
}

export default defineConfig({
  plugins: [react(), pvEstimatorAppCleanUrl(), injectPvEstimatorApiBase()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: PV_ESTIMATOR_API,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
    proxy: {
      "/api": {
        target: PV_ESTIMATOR_API,
        changeOrigin: true,
      },
    },
  },
})
