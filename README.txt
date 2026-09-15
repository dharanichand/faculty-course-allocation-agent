FCAA Faculty Portal Fix

Replace these files in your project:
  server/src/routes/auth.js
  client/src/pages/Preferences.jsx

What this fixes:
- Faculty login now resolves a missing/stale facultyId from the Faculty collection.
- If the application Faculty collection is empty, login can rebuild the faculty profile from dataset_faculty_gmail_dataset.
- The user record is updated with the resolved facultyId.
- Preferences matches faculty by ID, email, or name and then loads the correct profile.

After deploying the backend and frontend:
1. Sign out of the Faculty account.
2. Sign in again.
3. Open Preferences.
