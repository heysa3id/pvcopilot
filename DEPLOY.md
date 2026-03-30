# PVCopilot — Build & Deploy

Steps to build the project and deploy it (frontend + backend).

---

## 1. Prerequisites

- **Node.js** (v18+ recommended) and **npm**
- **Python 3.10+** (for backend)
- (Optional) **venv** for an isolated Python environment

---

## 2. Frontend build

From the project root:

```bash
# Install dependencies (first time or after package.json changes)
npm install

# Build for production (output in dist/)
npm run build
```

- Build output: **`dist/`** (static files: `index.html`, `assets/*.js`, `assets/*.css`)
- Serve `dist/` with any static host (Nginx, Apache, Vercel, Netlify, S3 + CloudFront, etc.)

**Preview the production build locally:**

```bash
npm run preview
```

---

## 3. Backend setup (API)

Backend runs on **port 5001** and provides:

- `POST /api/parse-pvsyst` — parse PVSyst PDF
- `POST /api/process-csv` — process CSV (used by Data Quality Check PV Data + Weather Data uploads)
- `POST /api/contact` — save contact form submissions (CSV, `backend/data/contacts.csv`)
- `GET /api/contacts` — list saved contacts (JSON)
- `GET /api/health` — health check

**From project root:**

```bash
# Create and activate a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install backend dependencies
pip install -r backend/requirements.txt

# Run the API (development)
cd backend && python3 server.py
# Or: npm run backend
```

**Production run (example):**

```bash
cd backend
# Use a production WSGI server, e.g. gunicorn
pip install gunicorn
# Upload size limits (both configurable, defaults are 50MB):
# export MAX_PVSYST_UPLOAD_BYTES=52428800
# export MAX_CSV_UPLOAD_BYTES=52428800

# Gunicorn with thread workers helps concurrent PDF parsing requests:
gunicorn -w 4 --threads 4 -k gthread --timeout 120 -b 0.0.0.0:5001 server:app
```

**Concurrency smoke test (optional):**

```bash
python3 backend/concurrent_parse_smoke_test.py --pdf /path/to/report.pdf --concurrency 8 --timeout 60
```

---

## 4. Point frontend to the deployed API

The app defaults to **`http://localhost:5001`** when env vars are unset. For any public deployment (including GitHub Pages), host the Flask backend on an HTTPS origin and set build-time variables so the browser calls that host instead of localhost.

### Build-time variables (Vite)

| Variable | Used by | Value (example) |
|----------|---------|-------------------|
| `VITE_API_BASE` | Contact form, Quality Check, **PV Layout Estimator** (injected into `dist/pv-estimator-app/index.html` so `/pv-estimator-app/` calls this origin for `/api/weather`, `/api/modules`, `/api/inverters`) | `https://your-api.example.com` (no trailing slash) |
| `VITE_PARSER_URL` | `src/pages/LcoeTool.jsx` (PVsyst PDF upload) | `https://your-api.example.com/api/parse-pvsyst` |

For a local production check, create `.env.production` in the repo root:

```bash
VITE_API_BASE=https://your-api.example.com
VITE_PARSER_URL=https://your-api.example.com/api/parse-pvsyst
```

Then run `npm run build`.

**Note:** `VITE_*` values are embedded in the client bundle; treat them as public configuration, not secrets.

### GitHub Pages (`.github/workflows/deploy-pages.yml`)

The workflow passes the same variables into `npm run build`. After your API is deployed:

1. Open the repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Add repository secrets:
   - **`VITE_API_BASE`** — HTTPS origin of the Flask app (no trailing slash).
   - **`VITE_PARSER_URL`** (optional but recommended) — full URL to `.../api/parse-pvsyst`.

If these are not set, the CI build still succeeds, but the live site will fall back to `localhost` for API calls (contact form, Quality Check, **PV Layout Estimator weather/module/inverter APIs**, and related features will not work for real users).

After changing the backend, **redeploy Flask** so it includes [`backend/pv_estimator_proxy.py`](backend/pv_estimator_proxy.py) (routes: `/api/weather`, `/api/modules`, `/api/modules/manufacturers`, `/api/inverters`, `/api/inverters/manufacturers`).

### Same-origin proxy (alternative)

If you serve the frontend behind Nginx (or similar) and proxy `/api` to the backend, you could instead use relative URLs like `/api/...` in code for that deployment only — the current codebase uses absolute bases from env for cross-domain Pages + API setups.

---

## 5. Deployment checklist

| Step | Command / action |
|------|-------------------|
| 1. Install frontend deps | `npm install` |
| 2. Build frontend | `npm run build` (set `VITE_API_BASE` / `VITE_PARSER_URL` or use `.env.production`) |
| 3. Backend deps | `pip install -r backend/requirements.txt` |
| 4. Set API URL | `VITE_API_BASE`, `VITE_PARSER_URL`, GitHub Actions secrets for Pages, or proxy (see §4) |
| 5. Deploy `dist/` | Upload to static host or copy to server |
| 6. Run backend | Start Flask/gunicorn on port 5001 (or your chosen port) |
| 7. CORS | Backend uses `CORS(app)`; cross-origin requests from the Pages domain are allowed |

---

## 6. One-command build (frontend only)

```bash
npm install && npm run build
```

Output is in **`dist/`**. Deploy that folder and run the backend separately on your server.
