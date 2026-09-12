# Deployment Guide

## 1. MongoDB Atlas

1. Create a free MongoDB Atlas cluster.
2. Create a database user and password.
3. In **Network Access**, allow the IP addresses used by your backend host. For a quick student demo you can temporarily allow `0.0.0.0/0`, then restrict it later.
4. Copy the Atlas connection string and set it as `MONGODB_URI`.
5. The backend automatically seeds the supplied faculty, course, allocation-candidate and conflict data into an empty database on first successful connection.

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
MONGODB_URI=your-atlas-connection-string
GROQ_API_KEY=your-groq-key
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.3-70b-versatile
JWT_SECRET=your-long-random-secret
FRONTEND_URL=http://localhost:5173
```

The API health endpoint is `/api/health`.

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
