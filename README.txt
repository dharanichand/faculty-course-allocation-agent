FCAA Faculty Portal data-link fix

Replace only:
  server/src/routes/auth.js
  server/src/routes/allocations.js

What this fixes:
- Resolves a Faculty account by email/name even when the JWT contains a stale facultyId.
- Bridges accounts to the imported dataset_faculty_gmail_dataset / dataset_person / dataset_faculty records.
- Uses the resolved Faculty ID for /allocations/my and /allocations/notifications, so existing allocation records are shown on the Faculty Dashboard.
- Normal login keeps the official HOD name as Dr.Phani Kumar.

After deployment:
1. Sign out of the Faculty account.
2. Sign in again so a fresh JWT is issued.
3. Refresh the Faculty Dashboard.
