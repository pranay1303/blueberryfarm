# Blueberry Farm & Resort — 100% Free Cloud Deployment Guide (Mobile-First)

Deploy your full stack for **₹0/month** so you can manage the resort directly from your **mobile phone** without keeping a PC turned on.

---

## Architecture
- **Frontend (React + Vite PWA)**: [Vercel](https://vercel.com/) (Free)
- **Backend (FastAPI Python)**: [Render](https://render.com/) (Free)
- **Database (MySQL 8)**: [Aiven for MySQL](https://aiven.io/) or [TiDB Cloud](https://tidbcloud.com/) (Free)

---

## Step 1: Push Project to GitHub

> If Git is not yet installed on Windows, install it from https://git-scm.com/download/win (keep default options) and reopen your terminal.

```powershell
cd C:\Users\ADMIN\Downloads\BlueberryFarm
git init
git add .
git status   # Verify .env, storage/.jwt_secret, node_modules, and backups are NOT listed
git commit -m "Initial production-ready Blueberry Farm & Resort release"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/blueberry-farm-resort.git
git push -u origin main
```

---

## Step 2: Create Free Cloud MySQL Database (Aiven)

1. Sign up at [aiven.io](https://aiven.io/) (no credit card required for free plan).
2. Click **Create Service** → **MySQL** → choose **Free Plan** → select a nearby region (e.g., Mumbai / Singapore).
3. Once running, copy:
   - **Host** (`MYSQL_HOST`)
   - **Port** (`MYSQL_PORT`)
   - **Database Name** (`MYSQL_DATABASE`, usually `defaultdb`)
   - **User** (`MYSQL_USER`, usually `avnadmin`)
   - **Password** (`MYSQL_PASSWORD`)

---

## Step 3: Deploy FastAPI Backend on Render (Free)

1. Go to [dashboard.render.com](https://dashboard.render.com/) → **New** → **Blueprint**.
2. Connect your GitHub repository — Render automatically detects `render.yaml`.
3. Fill in the prompted environment variables from Step 2:
   - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
   - `CORS_ORIGINS`: `https://<your-vercel-app>.vercel.app` (you can update this right after Step 4)
4. Click **Apply** and wait ~2 minutes.
5. Verify your backend is live by visiting:
   `https://<your-render-service>.onrender.com/api/health`
   (Should return `"status": "ok"` and `"connected": true`.)

---

## Step 4: Deploy Frontend on Vercel (Free)

1. In `frontend/vercel.json`, replace `https://blueberry-farm-api.onrender.com` with your actual Render backend URL from Step 3, then commit & push:
   ```powershell
   git add frontend/vercel.json
   git commit -m "Point Vercel API proxy to Render backend"
   git push
   ```
2. Go to [vercel.com/new](https://vercel.com/new) → import your GitHub repository.
3. Set **Root Directory** to `frontend`.
4. Leave Framework Preset as **Vite** and click **Deploy**.
5. Copy your live Vercel URL (e.g. `https://blueberry-farm.vercel.app`) and paste it into Render's `CORS_ORIGINS` environment variable.

---

## Step 5: Keep Backend Awake (Optional Free Trick)

Render's free tier sleeps after 15 minutes of inactivity. To keep it instant for guests:
1. Create a free account on [UptimeRobot](https://uptimerobot.com/) or [cron-job.org](https://cron-job.org/).
2. Add an HTTP(s) monitor pinging `https://<your-render-service>.onrender.com/api/health` every **10 minutes**.

---

## Step 6: Install on Your Mobile Phone (PWA App)

- **Android (Chrome)**: Open `https://<your-vercel-app>.vercel.app/admin` → tap the **⋮ menu** → **Add to Home screen** → **Install**.
- **iPhone (Safari)**: Open `https://<your-vercel-app>.vercel.app/admin` → tap the **Share icon** → **Add to Home Screen**.

You now have a full-screen **Blueberry Farm** app right on your phone!
