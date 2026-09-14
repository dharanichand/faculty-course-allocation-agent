# Deployment Guide

## 1. MongoDB Atlas

1. Create a free MongoDB Atlas cluster.
2. Create a database user and password.
3. In **Network Access**, allow the IP addresses used by your backend host. For a quick student demo you can temporarily allow `0.0.0.0/0`, then restrict it later.
4. Copy the Atlas connection string and set it as `MONGO_URI`.
5. The backend is MongoDB-only. It does not read CSV/XLSX files and does not fall back to local-memory data. Your MongoDB database must contain the faculty, course, allocation and conflict records.

## 2. Backend

Run locally:

```bash
cd server
npm install
npm start
```

Required environment variables:

```env
PORT=5000
MONGO_URI=your-atlas-connection-string
GROQ_API_KEY=your-groq-key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
JWT_SECRET=your-long-random-secret
FRONTEND_URL=http://localhost:5173
```

Also set these, or the placeholder logins and email notifications silently
won't match your local setup:

```env
# Seeds hod@college.edu / faculty@college.edu placeholder accounts on boot.
# Defaults to true, so this only needs setting if you want to turn it OFF.
SEED_DEMO_USERS=true

# Leave unset/false on any deployment reachable by more than you. It enables
# a passwordless "Continue as demo" HOD login for anyone with the URL.
ALLOW_DEMO_LOGIN=false

# Without these, allocation/approval/reassignment emails are skipped.
# BREVO_SENDER_EMAIL must be a verified sender identity in your Brevo account.
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=your-verified-sender@yourdomain.com
BREVO_SENDER_NAME=Faculty Course Allocation Agent
```

The API health endpoint is `/api/health` — it reports whether the database
and email are actually connected/configured, which is the fastest way to
confirm a deployment matches your local setup.

For production, deploy the `server` directory to a Node host such as Render, Railway, or another Express-compatible service. Use the same environment variables there.

## 3. Frontend on Vercel

In Vercel:

- **Application Preset:** Vite (or Other if Vercel does not show Vite)
- **Root Directory:** `client`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

Add this frontend environment variable:

```env
VITE_API_URL=https://YOUR-BACKEND-DOMAIN/api
```

After deployment, put the Vercel URL into the backend's `FRONTEND_URL` variable.

## 4. Important security note

Never commit `server/.env`. The deliverable intentionally contains only `.env.example`. If a real MongoDB or API credential was ever pushed to GitHub, rotate that credential before using the repository publicly.
