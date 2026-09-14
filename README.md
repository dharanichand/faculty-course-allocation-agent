# Phase 1 (Security & Correctness) — Changed Files

Drop these files into your project at the matching paths, overwriting the
existing ones. Directory structure in this zip mirrors the project root
(`server/...`, `client/...`).

## Files included (new or modified)

- `server/src/config/secrets.js` — **new**. Central `getJwtSecret()` helper;
  throws if `JWT_SECRET` is unset instead of falling back to a hardcoded
  default.
- `server/src/middleware/validate.js` — **new**. Generic zod-based request
  validation middleware.
- `server/src/validation/schemas.js` — **new**. Zod schemas for every
  `/api/auth` and `/api/allocations` route body/params.
- `server/src/middleware/auth.js` — **modified**. Uses `getJwtSecret()`
  instead of a hardcoded fallback.
- `server/src/routes/auth.js` — **modified**. `/demo` now gated behind
  `ALLOW_DEMO_LOGIN=true` (default false, returns 404 otherwise); all routes
  validated with zod.
- `server/src/routes/allocations.js` — **modified**. Added zod validation to
  bulk-approve, bulk-reject, approve, reject, and override routes.
- `server/src/index.js` — **modified**. Asserts `JWT_SECRET` is configured at
  startup (exits with a clear error if not); added a dedicated, stricter
  rate limiter for `/api/auth/*`.
- `server/package.json` — **modified**. Added `zod` as an explicit dependency
  (run `npm install` in `server/` after copying).
- `server/.env.example` — **modified**. Rewritten to cover every env var
  actually used in the code, with placeholders only; adds `ALLOW_DEMO_LOGIN`.
- `client/src/api.js` — **modified**. Removed automatic, credential-free
  token minting via `/api/auth/demo` on every API call (this was silently
  bypassing the login screen). Now redirects to `/login` if there's no
  stored token.
- `client/src/pages/AgentChat.jsx` — **modified**. Same fix as `api.js`,
  applied to this page's separate token-fetching code path.

## Files to DELETE from your project (not included — there's nothing to copy)

These were unused, duplicate Mongoose-only data-access files, never imported
by any route or by `agentTools.js` (confirmed via grep — they only imported
each other). Delete them:

- `server/src/tools/facultyTools.js`
- `server/src/tools/courseTools.js`
- `server/src/tools/conflictTools.js`
- `server/src/tools/workloadTools.js`
- `server/src/tools/historyTools.js`

## After applying

1. `cd server && npm install` (picks up the new `zod` dependency).
2. Make sure `server/.env` has a real `JWT_SECRET` set — the server will now
   refuse to start without one. Compare against the updated
   `server/.env.example` for the full list of variables the code uses.
3. Do **not** set `ALLOW_DEMO_LOGIN=true` in any shared/staging/production
   environment — leave it unset or `false` there. It's only for local dev.
4. Rotate the credentials that were in your original `server/.env`
   (MongoDB Atlas password, Groq API key, Brevo API key, JWT secret) if you
   haven't already — they were exposed in the zip you shared earlier.
