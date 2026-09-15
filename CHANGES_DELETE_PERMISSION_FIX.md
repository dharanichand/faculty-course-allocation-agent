# Fix: deleting a request now works for real accounts, not just demo logins

## What was wrong
The delete permission (added in the previous patch) required
`req.user.facultyId === request.facultyId` for a non-HOD to delete their own
request. That field is set directly and reliably for a demo faculty login
(you pick the exact record), but for a **real** account it's auto-resolved at
login time by matching your account's email/name against the imported
dataset — and that match doesn't always land on the exact same record. When
it missed, the delete silently returned a 403 even for your own request.

## The fix
`server/src/routes/data.js` — the check no longer depends on that identity
match at all. Since creating a request on this page was never restricted to
"your own" faculty either (any signed-in user can add a request for any
faculty via the dropdown), deleting a still-undecided (pending/recommended)
request is now open to any signed-in user the same way. Once HOD/Dean has
actually approved or rejected a request, deleting that record is reserved for
HOD/Dean only.

Because this is a real MongoDB delete (not a status flag), it disappears from
every page that reads the Allocation collection — Requests list, HOD Review
queue, Reports/dashboard, `/export` — for everyone, immediately, regardless of
which account (demo or real) deleted it.

## File in this zip
- `server/src/routes/data.js`

Syntax-checked with `node --check` before packaging.
