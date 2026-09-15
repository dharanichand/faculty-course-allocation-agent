# Changes: semester scoping, real workload tracking, a whole-semester optimizer, gap analysis, and search that scales

No UI files are touched by this patch. Every change is server-side; the app looks and behaves
exactly the same to a user clicking through the existing screens, it just does more and holds up
better on a larger dataset. Drop these files into your project at the matching paths (overwriting
the existing ones), then `cd server && npm install` is **not** required — no new dependencies were
added.

## Files in this zip

- `server/src/models/Course.js` — **modified**. Added `academicYear`/`semester` fields (blank/optional
  for old records, so nothing breaks) and indexes for department+term+status lookups and text search.
- `server/src/models/Allocation.js` — **modified**. Same `academicYear`/`semester` addition, plus an
  `aiFlag` field that routes/allocations.js was already trying to save but the schema silently dropped
  (Mongoose strict mode strips undeclared fields), and indexes on the two access patterns that matter
  ("all pending rows for a course", "all rows for a faculty member in a term").
- `server/src/models/Faculty.js` — **modified**. Added the `employeeNo` field (same silent-drop issue —
  `store.js`/`graph.js` already read/searched it, but it was never declared so it was never actually
  saved), plus a department index and a text index for keyword search.
- `server/src/data/store.js` — **modified**.
  - `searchFaculty`/`searchCourses` now query MongoDB directly (text-index search, then a bounded regex
    fallback for ID/partial matches) with real pagination, instead of loading the *entire* collection
    into Node and filtering with `.includes()` — the old version scanned and shipped the whole table on
    every search keystroke, which is the first thing that breaks at real dataset size.
  - `pendingAllocations`, `courseRequests`, `allCourses` now take an optional `{academicYear, semester,
    department}` scope. Calling them with no arguments behaves exactly as before.
  - New `applyWorkloadDelta(facultyId, hours)` and `hoursForCourse(course)` — see the workload bug below.
- `server/src/services/allocationOptimizer.js` — **new**. Solves a whole semester's pending requests
  together instead of picking a winner per course in isolation (see "Why the optimizer changed" below).
  Read-only — it never writes to the database.
- `server/src/services/aiAllocation.js` — **modified**. Removed the hardcoded "CSE department" wording
  from the system prompt (the department now comes from verified course data). Added
  `narrateDraftInBatches`, which turns a full semester's worth of LLM explanation calls into a handful
  of batched calls instead of one Groq call per course.
- `server/src/tools/allocationTools.js` — **unchanged**. `calculateRecommendationScore` is reused as-is
  by the optimizer.
- `server/src/tools/agentTools.js` — **modified**. Added two tools (`get_gap_analysis`,
  `run_semester_optimization`) so the existing chat agent can be asked things like "which courses have
  no suitable faculty?" or "run the allocation for this semester" — no chat UI changes needed, the new
  capability just shows up in the same chat window.
- `server/src/agents/graph.js` — **modified**. Generalized the hardcoded "CSE department" system prompt
  wording to a generic department (read from verified tool data), added a rule that the new optimizer
  tool is proposal-only, and added local-fallback keyword routing for the two new tools (used when
  `GROQ_API_KEY` isn't configured, same pattern the file already uses for its other tools).
- `server/src/routes/allocations.js` — **modified**.
  - Fixed the workload-tracking bug (below) at every point an allocation becomes approved: single
    approve, bulk-approve, `run-ai` auto-approve, and override.
  - Added `POST /api/allocations/optimize` (kicks off a background job, returns a `jobId` immediately —
    doesn't block the request while it scores/optimizes/narrates a whole semester),
    `GET /api/allocations/optimize/:jobId` (poll the result), `POST /api/allocations/optimize/:jobId/apply`
    (HOD applies some or all of the draft — pass `{"courseIds": [...]}` to apply only specific rows, or
    omit it to apply everything), and `GET /api/allocations/gap-analysis` (read-only report of courses
    with no viable faculty right now, with reasons).
- `server/src/migrateSemesterFields.js` — **new**, run manually, not on boot. One-time backfill that
  sets `academicYear`/`semester` on existing Course/Allocation records that don't have them yet:
  ```
  cd server
  node src/migrateSemesterFields.js --academicYear=2026-27 --semester=I
  ```
  Safe to skip — everything works unfiltered without it — and safe to re-run (only touches blank fields).

## The workload bug this fixes

`Faculty.currentWorkload` was read by the hard-violation check ("would this exceed max workload?") but
was **never incremented anywhere** when an allocation got approved. In practice that meant the workload
cap only ever saw whatever number a faculty record was seeded with — a faculty member could be
auto-approved for several courses in the same `run-ai` pass, or across separate HOD clicks over time,
and quietly exceed their cap with no violation ever firing. `applyWorkloadDelta` now runs at every
approve/override/auto-approve point, and is reversed on override reassignment.

## Why the optimizer changed

The original `analyze_course` (still there, unchanged, still used by `run-ai` for one-course-at-a-time
review) picks the best candidate for one course at a time. Run course-by-course across a whole
semester, that can't guarantee two things the project spec asks for: every faculty member staying
within their workload band, and no course being left without a match when a feasible one exists
somewhere. `allocationOptimizer.js` treats the whole semester as one constrained assignment problem —
score every request once, assign by "regret" (courses with only one good option go first, so they
don't lose it to a course that had other good options anyway), then run a bounded pairwise-swap pass to
squeeze out easy score improvements — bounded to a fixed number of passes so runtime stays predictable
as the number of courses grows. It's a heuristic (the underlying problem is NP-hard), not an exact
solver, but it's deterministic and explainable, which matters more than optimality for something an HOD
has to sign off on.

It never writes to the database by itself — that's what `/optimize/:jobId/apply` is for, and the HOD
can apply all of it, some of it, or none of it.

## Still on you

1. Rotate the credentials in `server/.env` (Mongo password, Groq key, JWT secret, Brevo key) if you
   haven't already — see the earlier `README.md`/`CHANGES.md` in this project for the same note. This
   patch doesn't touch that file.
2. Run the migration script above once you're ready to start scoping things by semester, otherwise
   everything keeps working unfiltered exactly as before.
3. The text-index + regex fallback search in `store.js` is a real improvement over loading the whole
   collection into memory, but if the faculty table eventually grows into the tens of thousands, plain
   regex fallback search stops being fast — that's the point to look at MongoDB Atlas Search or a
   trigram index instead.
