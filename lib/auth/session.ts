import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from '../database';
import { getAccess } from '../access-store';
import { isToken, tokenHash, safeReturnTo } from './crypto';

export type CurrentUser = { userId: string; email: string; displayName: string; fullName: string | null };
const secureCookie = (() => { try { return new URL(process.env.APP_ORIGIN || 'http://localhost').protocol === 'https:'; } catch { return false; } })();
export const SESSION_COOKIE = secureCookie ? '__Host-smee-session' : 'smee-session';
export const SESSION_SECONDS = 8 * 60 * 60;
export function sessionCookieOptions() { return { httpOnly: true, secure: secureCookie, sameSite: 'lax' as const, path: '/', maxAge: SESSION_SECONDS }; }
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isToken(raw)) return null;
  const result = await query<{ id: string; email: string; display_name: string }>(
    `SELECT u.id,u.email,u.display_name FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id AND u.credential_version=s.credential_version WHERE s.token_hash=$1 AND s.expires_at>now()`, [tokenHash(raw)]);
  const row = result.rows[0]; if (!row) return null;
  const user = { userId: row.id, email: row.email, displayName: row.display_name, fullName: row.display_name };
  try { await getAccess(user); } catch (error) { if (typeof error === 'object' && error && 'status' in error && (error.status === 401 || error.status === 403)) return null; throw error; }
  return user;
}
export async function requireCurrentUser(returnTo = '/'): Promise<CurrentUser> { const user = await getCurrentUser(); if (user) return user; redirect('/login?returnTo=' + encodeURIComponent(safeReturnTo(returnTo))); }
