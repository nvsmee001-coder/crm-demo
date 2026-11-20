import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from '../database';
import { getReadAccess } from '../access-store';
import { isToken, tokenHash, safeReturnTo } from './crypto';
import { mfaAvailable, mfaRequired } from './mfa-crypto';

export type CurrentUser = { userId: string; email: string; displayName: string; fullName: string | null };
const secureCookie = (() => { try { return new URL(process.env.APP_ORIGIN || 'http://localhost').protocol === 'https:'; } catch { return false; } })();
export const SESSION_COOKIE = secureCookie ? '__Host-smee-session' : 'smee-session';
export const SESSION_SECONDS = 8 * 60 * 60;
export function sessionCookieOptions() { return { httpOnly: true, secure: secureCookie, sameSite: 'lax' as const, path: '/', maxAge: SESSION_SECONDS }; }
export async function getMfaSession() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isToken(raw)) return null;
  const result = await query<{id:string;email:string;display_name:string;setup:boolean;verified:boolean;pending:boolean;enabled:boolean;remaining:number}>(
    `SELECT u.id,u.email,u.display_name,s.mfa_setup_only AS setup,s.mfa_verified AS verified,
      u.mfa_pending_enrollment AS pending,EXISTS(SELECT 1 FROM auth_mfa_factors WHERE user_id=u.id) AS enabled,
      (SELECT count(*)::int FROM auth_mfa_recovery_codes WHERE user_id=u.id) AS remaining
      FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id AND u.credential_version=s.credential_version
      WHERE s.token_hash=$1 AND s.expires_at>now()`, [tokenHash(raw)]);
  const row = result.rows[0]; if (!row) return null;
  const user = { userId: row.id, email: row.email, displayName: row.display_name, fullName: row.display_name };
  let access;
  try { access=await getReadAccess(user); } catch (error) { if (typeof error === 'object' && error && 'status' in error && (error.status === 401 || error.status === 403)) return null; throw error; }
  if ((row.setup && row.enabled) || (!row.setup && !row.verified && (row.enabled || row.pending || mfaRequired(access.role)))) return null;
  return {user,token:raw,setupOnly:row.setup,enabled:row.enabled,remaining:row.remaining,available:mfaAvailable()};
}
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session=await getMfaSession();
  return session && !session.setupOnly ? session.user : null;
}
export async function requireCurrentUser(returnTo = '/'): Promise<CurrentUser> { const user = await getCurrentUser(); if (user) return user; redirect('/login?returnTo=' + encodeURIComponent(safeReturnTo(returnTo))); }
