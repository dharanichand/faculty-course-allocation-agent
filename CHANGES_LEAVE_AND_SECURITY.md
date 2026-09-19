# Changes: leave/sabbatical hard constraint, admin-load capacity, secret sanitization, tests

## Files in this update

- `server/.env` — **sanitized**. This file contained a live MongoDB Atlas
  password, Groq API key, JWT secret, and Brevo API key (already flagged as
  exposed once before in `CHANGES.md`, but still present, unrotated). All
  four values have been blanked out. **You must still rotate all four in
  their respective consoles** — MongoDB Atlas, console.groq.com, Brevo — and
  generate a fresh `JWT_SECRET` (`openssl rand -hex 32`). This file is
  already in `.gitignore` and was never committed to git, but it was
  present in the shared zip, which git ignores don't protect against.
- `server/src/index.js` — **modified**. Refuses to boot with
  `ALLOW_DEMO_LOGIN=true` when `NODE_ENV=production` (that flag mints an
  unauthenticated, fully-privileged HOD token to anyone with the URL), and
  warns at boot if `SEED_DEMO_USERS` isn't explicitly `false` in production.
- `server/src/models/Faculty.js` — **modified**. Added `onLeave` (Boolean),
  `leaveReason` (String), and `adminLoadHours` (Number) fields. Kept
  separate from the existing `status` field so marking someone on leave
  doesn't also hide them from normal faculty listings/searches.
- `server/src/tools/allocationTools.js` — **modified**.
  - Extracted the scoring math into a new pure function `computeScore(faculty,
    course, history, historyCourses, config)` that takes plain objects and
    does no DB access. `calculateRecommendationScore(facultyId, courseId)`
    is now a thin wrapper that fetches the records and delegates to it.
  - A faculty member with `onLeave: true` is now a **hard exclusion**
    (added to `hardViolations`) — they will never be recommended for a new
    allocation this term, however strong the expertise match looks.
  - `adminLoadHours` is now subtracted from `maxWorkload` *before* checking
    whether a course would push someone over capacity, so administrative
    responsibilities (committee work, coordinator duties, etc.) are
    reflected in effective teaching capacity, not just raw workload hours.
- `server/src/services/allocationOptimizer.js` — **modified**. The
  semester-wide optimizer's capacity bookkeeping (`remainingCapacity`) now
  applies the same admin-load reduction and treats `onLeave` faculty as
  having zero capacity, so the two code paths (single-course scoring vs.
  whole-semester optimization) can't disagree about who's eligible.
- `server/src/routes/data.js` — **modified**. `POST /api/data/faculty`
  (create) now accepts `onLeave`, `leaveReason`, and `adminLoadHours` in the
  request body. (`PUT /api/data/faculty/:id` already passed the full body
  through to `$set`, so updates needed no change.)
- `server/src/data/demoData.js` — **modified**. Added two demo faculty
  records: one on sabbatical (`F006`) and one carrying admin load (`F007`),
  so the new hard constraints are visible in the seeded demo data.
- `client/src/pages/Faculty.jsx` — **modified**. The "Add faculty" form now
  has an "On leave / sabbatical" checkbox (with a reason field) and an
  administrative-load-hours field. Faculty cards show a red "On leave"
  badge and an amber "Admin load" badge when applicable.
- `server/tests/allocationTools.test.js` — **new**. Unit tests for
  `computeScore()` covering: full expertise/qualification match, missing
  qualification (hard violation), on-leave exclusion, admin-load capacity
  reduction, workload-cap violation, preference-rank scoring, and both
  continuity cases (same course vs. prior part of a sequence). No database
  needed — these are pure-function tests.
- `server/package.json` — **modified**. Added `"test": "node --test"` (uses
  Node's built-in test runner, no new dependency).

## After applying

1. `cd server && npm test` — should show `11 passing`.
2. Rotate the four credentials mentioned above and fill in a fresh
   `server/.env` from `server/.env.example` before running for real.
3. `cd server && npm install && npm run dev` and `cd client && npm install
   && npm run dev` as before — no new dependencies were introduced.
4. If you have existing faculty records already in MongoDB from before this
   change, they'll simply default to `onLeave: false` and
   `adminLoadHours: 0` (Mongoose schema defaults) — no migration needed.
