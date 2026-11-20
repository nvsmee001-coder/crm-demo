import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Validate deployment inputs without echoing credentials in messages or logs. */
export function validateDeploymentEnvironment(env) {
  const fail = message => { throw new Error(message); };
  if (env.NODE_ENV !== 'production') fail('NODE_ENV must be production in the Docker deployment.');
  let origin;
  try { origin = new URL(env.APP_ORIGIN || ''); } catch { fail('Set APP_ORIGIN to the canonical HTTPS origin of this CRM.'); }
  if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN || origin.username || origin.password ||
      ['localhost','127.0.0.1','[::1]'].includes(origin.hostname) || /(^|\.)example\.(com|net|org)$/.test(origin.hostname)) {
    fail('APP_ORIGIN must be your real HTTPS origin without path or trailing slash.');
  }
  if (!env.APP_DOMAIN || origin.port || origin.hostname !== env.APP_DOMAIN.toLowerCase()) {
    fail('APP_DOMAIN must match the HTTPS hostname in APP_ORIGIN, using public HTTPS port 443.');
  }
  const email = (env.SMEE_OWNER_EMAIL || '').trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /@example\.(com|net|org)$/i.test(email)) {
    fail('Set SMEE_OWNER_EMAIL to the actual owner login email.');
  }
  if (!env.UPLOAD_DIR || !isAbsolute(env.UPLOAD_DIR)) fail('UPLOAD_DIR must be an absolute private directory.');
  let database, password;
  try { database = new URL(env.DATABASE_URL || ''); password = decodeURIComponent(database.password); }
  catch { fail('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
  if (!['postgres:','postgresql:'].includes(database.protocol) || !database.hostname || !database.username || database.pathname.length < 2) {
    fail('DATABASE_URL must identify a PostgreSQL host, user and database.');
  }
  if (password.length < 32 || /replace|change[_-]?me|your[_-]|example|password/i.test(password) || new Set(password).size < 8) {
    fail('Database password is missing, weak or a placeholder. Generate a fresh 64-character hex password with openssl rand -hex 32 and configure PostgreSQL consistently.');
  }
  const requireMfa=env.SMEE_REQUIRE_MFA || 'false';
  const mfaKey=env.SMEE_MFA_KEY || '';
  if (!['true','false'].includes(requireMfa)) fail('SMEE_REQUIRE_MFA must be true or false.');
  if ((requireMfa==='true' || mfaKey) && (!/^[a-f0-9]{64}$/i.test(mfaKey) ||
      new Set(mfaKey.toLowerCase()).size<8 || mfaKey.toLowerCase()===password.toLowerCase())) {
    fail('Generate a separate SMEE_MFA_KEY with openssl rand -hex 32.');
  }
  if (env.CLAMAV_REQUIRED !== 'true' || !env.CLAMAV_HOST || /\s/.test(env.CLAMAV_HOST)) fail('Production requires CLAMAV_REQUIRED=true and a valid CLAMAV_HOST.');
  const port = Number(env.CLAMAV_PORT || 3310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('CLAMAV_PORT must be a valid TCP port.');
  if (env.TRUST_PROXY !== 'true') fail('The Docker deployment requires TRUST_PROXY=true behind a trusted reverse proxy.');
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { validateDeploymentEnvironment(process.env); console.log('Production configuration validated.'); }
  catch (error) { console.error('Configuration rejected: ' + (error instanceof Error ? error.message : 'Invalid deployment inputs.')); process.exitCode = 1; }
}
