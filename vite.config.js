import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path";

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

export default defineConfig({
  plugins: [react(), pvEstimatorAppCleanUrl()],
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
