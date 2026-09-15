# Fix: deleting a request now actually deletes it

## The problem
There was no real delete for a request anywhere. The only "remove" action in the whole app was
the HOD Review page's **Reject** button, which just sets `status: 'rejected'` on the Allocation
document — the record stays in MongoDB forever, so it keeps showing up: in the Requests list
(with a "Rejected" badge), in Reports/dashboard counts, in `/export`, and to the chat agent's
tools. That's the behavior you were seeing.

## The fix
- `server/src/routes/data.js` — added `DELETE /api/data/requests/:id`. This does a real
  `Allocation.deleteOne(...)`, not a status change, so the record is gone from every page/report
  that reads the Allocation collection, not just hidden from one view.
  - If the request had already been **approved**, deleting it also gives back the workload hours
    it was holding against that faculty member (same release logic used when an HOD overrides an
    approved allocation), so it doesn't leave a phantom hold on their capacity.
  - An HOD/Dean can delete any request. A faculty member can only delete their **own** request,
    and only while it's still pending/awaiting review — once a decision has been made about it,
    that's a record someone else made and shouldn't be erasable by the person it's about.
  - Still writes an `AuditLog` entry (`DELETE_ALLOCATION_REQUEST`) for accountability — that's an
    internal audit trail, not shown on any user-facing page, so it doesn't bring the request back
    into view anywhere.
- `client/src/pages/Requests.jsx` — added a small delete (trash icon) button in the Action
  column, next to "Review" and "Ask agent", using the exact same button style/icon already used
  for deleting in `Faculty.jsx` — no new visual pattern introduced. Confirms before deleting.

## Files in this zip
- `server/src/routes/data.js`
- `client/src/pages/Requests.jsx`

Both were checked (Node syntax check for the route file, an esbuild JSX parse for the React file)
before packaging.
