# Fix: faculty dashboard always showing 0 / 0 / 0

## Root cause

The faculty side of the app has only one way to submit anything: the
**Preferences** page. That page only ever called
`PUT /api/data/faculty/:id/preferences`, which saves the ranked course list
onto the `Faculty` document itself.

Everything that shows a faculty member's request status - the Faculty
Dashboard ("My requests" / "Approved" / "Pending review"), the HOD's
"Faculty Requests" page, and the HOD Review queue - reads from a completely
separate `Allocation` collection instead.

Because saving preferences never created anything in `Allocation`, a faculty
member could save preferences as many times as they wanted and the dashboard
would always show `0 / 0 / 0`. This affects every faculty account, not just
one - it's a code gap, not a data or deployment problem.

## Files in this zip

- `server/src/routes/data.js` - **modified**. `PUT /faculty/:id/preferences`
  now syncs the `Allocation` collection to match whatever the faculty member
  currently has saved:
  - a preferred course with no existing request gets a new `pending`
    Allocation record (this is what the dashboard/HOD queue actually count).
  - a course the faculty member removes from their preferences has its
    still-undecided (`pending`/`recommended`) request withdrawn
    (`status: 'rejected'`, with a clear `overrideReason`).
  - a course that the HOD has already approved or rejected is left alone -
    editing preferences must never silently reverse a decision the HOD
    already made.
  - Same behaviour is mirrored in the in-memory fallback path for parity.
- `client/src/pages/Preferences.jsx` - **modified**. One-line copy change:
  the save confirmation now says the preferences were filed as requests, so
  it's visible that saving actually does something end-to-end.

## Drop-in

Copy these two files into your project at the matching paths (overwriting
the existing ones):

```
server/src/routes/data.js
client/src/pages/Preferences.jsx
```

No new dependencies, no schema changes, no migration needed.

## After applying

1. Redeploy the backend (Render/Railway/wherever `server/` runs) and
   rebuild+redeploy the Vercel frontend.
2. Log in as any faculty account, go to **Preferences**, add/save a course
   preference, then go back to **Dashboard** - "My requests" should now show
   a non-zero count immediately, with status "Pending HOD review".
3. Existing faculty who already saved preferences *before* this fix won't
   have retroactive Allocation records - they'll need to open Preferences
   and hit **Save preferences** once more (even with the same list) to file
   the request now that the sync exists.
