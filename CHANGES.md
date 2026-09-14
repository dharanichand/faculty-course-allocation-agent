# Changes: placeholder login + email on the deployed backend

## Files in this zip

- `server/src/index.js` — **modified**. Placeholder HOD/faculty account
  seeding (`hod@college.edu` / `faculty@college.edu`) no longer depends on
  `DEMO_MODE`. It now runs by default on every boot, in every environment,
  so the credentials pre-filled on the login screen work wherever the app
  is deployed — not just locally. Set `SEED_DEMO_USERS=false` to turn it
  off later once you're using real accounts.
- `server/.env.example` — **modified**. Documents `SEED_DEMO_USERS` and
  clarifies how it differs from `ALLOW_DEMO_LOGIN`.
- `DEPLOYMENT.md` — **modified**. The "required environment variables"
  list was missing `SEED_DEMO_USERS`, `ALLOW_DEMO_LOGIN`, and the three
  `BREVO_*` variables entirely, which is why the deployed backend didn't
  match localhost. Now complete.

Drop these three files into your project at the matching paths (overwriting
the existing ones), then redeploy.

## What you still have to configure yourself

Code can't fix the other half of this — it's environment configuration on
your host (Render or wherever the backend runs), and it was never included
in the original deployment guide:

1. **Redeploy the backend** after adding the file above — `SEED_DEMO_USERS`
   defaults to `true`, so once the new `index.js` is running, the
   `hod@college.edu` / `faculty@college.edu` logins will start working
   there on the next boot. No env var needs to be added for this part.

2. **Email (Brevo)** — add these three to your host's environment variables,
   using the same values as your local `server/.env`:
   ```
   BREVO_API_KEY=...
   BREVO_SENDER_EMAIL=...
   BREVO_SENDER_NAME=Faculty Course Allocation Agent
   ```
   `BREVO_SENDER_EMAIL` must be a verified sender identity in your Brevo
   account or sends will fail even with a valid key. Once set, every
   assign/approve/reject/reassign action already triggers the right email —
   that logic was already complete, it just had nothing to send with.

3. **The passwordless "Continue as demo" button** — left untouched on
   purpose. It's gated behind `ALLOW_DEMO_LOGIN`, which defaults to `false`
   and mints a fully-privileged HOD token to anyone who hits the URL, with
   no credential check at all. If you want that button working on the
   public deployed link too, you can set `ALLOW_DEMO_LOGIN=true` yourself —
   it's a one-line env var, no code change needed — but understand that
   means **anyone with the link can act as HOD** with zero login. The
   password-gated `hod@college.edu` login (fixed above) gives the same demo
   experience without that exposure, so it's worth using that instead
   unless you specifically need the one-click button in production.

4. **Rotate your credentials.** The `server/.env` you shared earlier has a
   live MongoDB password, Groq key, JWT secret, and Brevo key in it. Rotate
   all four once you're done deploying.
