// Centralized access to the JWT signing secret.
//
// RULE (security): the server must never sign or verify tokens with a
// hardcoded fallback secret. If JWT_SECRET is missing, every token this
// server has ever issued would be forgeable by anyone who read the source,
// so we fail loudly at startup instead of silently running insecurely.
let cachedSecret;

export function getJwtSecret() {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error(
      'JWT_SECRET environment variable is not set. Refusing to start: ' +
      'signing tokens with a hardcoded default would let anyone forge ' +
      'authentication for any role. Set JWT_SECRET in server/.env (see ' +
      'server/.env.example) and restart.'
    );
  }
  cachedSecret = secret;
  return cachedSecret;
}

// Called once, eagerly, at process startup (see index.js) so a missing
// secret is a clear, immediate boot failure rather than a runtime 500 the
// first time someone tries to log in.
export function assertJwtSecretConfigured() {
  getJwtSecret();
}
