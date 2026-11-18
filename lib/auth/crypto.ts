import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const COST = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };
const HASH_BYTES = 64;
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return 'Mật khẩu cần từ 12 đến 128 ký tự.';
  if (password.trim().length < 12) return 'Mật khẩu cần ít nhất 12 ký tự không chỉ là khoảng trắng.';
  return null;
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, HASH_BYTES, COST, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const problem = passwordProblem(password); if (problem) throw new Error(problem);
  const salt = randomBytes(32), key = await derive(password, salt);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 128) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== String(COST.N) || parts[2] !== String(COST.r) || parts[3] !== String(COST.p) || !/^[a-f0-9]{64}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const actual = await derive(password, Buffer.from(parts[4], 'hex'));
  return timingSafeEqual(actual, Buffer.from(parts[5], 'hex'));
}
export function newToken(): string { return randomBytes(32).toString('hex'); }
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function isToken(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function normalizeEmail(value: unknown): string { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
export function validEmail(value: string): boolean { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000 || !value.startsWith('/') || value.startsWith('//') || /[\u0000-\u001f\\]/.test(value)) return '/';
  try { const url = new URL(value, 'https://app.invalid'); if (url.origin !== 'https://app.invalid' || /^\/(?:login|activate|api\/auth)(?:\/|$)/.test(url.pathname)) return '/'; return url.pathname + url.search + url.hash; } catch { return '/'; }
}
