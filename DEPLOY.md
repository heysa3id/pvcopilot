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
- `POST /api/process-csv` — process CSV
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
gunicorn -w 4 -b 0.0.0.0:5001 server:app
```

---

## 4. Point frontend to the deployed API

The app currently uses **`http://localhost:5001`** for the API. For deployment you must point it to your real API URL.

**Option A — Build-time variable**

- Add an env variable (e.g. `VITE_API_URL`) in `.env.production` and use it in code, then rebuild.

**Option B — Same-origin proxy**

- Serve the frontend and proxy `/api` to the backend (e.g. Nginx or your host’s proxy). Then use relative URLs like `/api/...` so no code change is needed per environment.

Update these in the repo before building for production:

- `src/pages/QualityCheckPage.jsx` — `API_BASE`
- `src/pages/LcoeTool.jsx` — `PARSER_URL`

Example with a variable:

```js
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001";
```

Then set `VITE_API_URL=https://your-api-domain.com` (no trailing slash) when building.

---

## 5. Deployment checklist

| Step | Command / action |
|------|-------------------|
| 1. Install frontend deps | `npm install` |
| 2. Build frontend | `npm run build` |
| 3. Backend deps | `pip install -r backend/requirements.txt` |
| 4. Set API URL | Configure `VITE_API_URL` or proxy (see §4) |
| 5. Deploy `dist/` | Upload to static host or copy to server |
| 6. Run backend | Start Flask/gunicorn on port 5001 (or your chosen port) |
| 7. CORS | Backend has CORS enabled; if frontend and API are on different domains, ensure your API domain is allowed |

---

## 6. One-command build (frontend only)

```bash
npm install && npm run build
```

Output is in **`dist/`**. Deploy that folder and run the backend separately on your server.
