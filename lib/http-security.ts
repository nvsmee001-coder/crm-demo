import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { query } from './database';

export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function appOrigin(): string {
  const raw = process.env.APP_ORIGIN || (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:3000' : '');
  if (!raw) throw new HttpError('Máy chủ chưa cấu hình APP_ORIGIN.', 503);
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpError('APP_ORIGIN không hợp lệ.', 503); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    throw new HttpError('APP_ORIGIN phải là URL HTTPS của CRM (HTTP chỉ dùng trên loopback).', 503);
  }
  return url.origin;
}

/** The canonical origin is configured by the operator, never derived from Host or forwarding headers. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin || origin !== appOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError('Yêu cầu phải xuất phát từ ứng dụng CRM.', 403);
  }
}

/** Caddy must overwrite X-Real-IP; the application port must remain private. */
export function clientAddress(request: Request): string {
  if (process.env.TRUST_PROXY !== 'true') return 'direct';
  const value = request.headers.get('x-real-ip')?.trim() || '';
  return isIP(value) ? value : 'unknown';
}

export async function readBodyLimited(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new HttpError('Nội dung yêu cầu quá lớn.', 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Date.now() + 15_000;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new HttpError('Yêu cầu đã hết thời gian.', 408);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HttpError('Yêu cầu đã hết thời gian.', 408)), remaining); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new HttpError('Nội dung yêu cầu quá lớn.', 413);
      chunks.push(next.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function readJsonBody(request: Request, maxBytes = 20_000): Promise<any> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError('Yêu cầu cần định dạng JSON.', 415);
  const raw = await readBodyLimited(request, maxBytes);
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError('Dữ liệu JSON không hợp lệ.', 400); }
}

let nextCleanup = 0;
/** Shared PostgreSQL counters also apply across restarts and multiple app processes. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) throw new Error('Invalid rate limit');
  const hash = createHash('sha256').update(key).digest('hex');
  const result = await query<{ hits: number }>(`
    INSERT INTO security_rate_limits (key, hits, expires_at) VALUES ($1, 1, NOW() + $2::integer * INTERVAL '1 second')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN security_rate_limits.expires_at <= NOW() THEN 1 ELSE LEAST(security_rate_limits.hits + 1, 1000000000) END,
      expires_at = CASE WHEN security_rate_limits.expires_at <= NOW() THEN NOW() + $2::integer * INTERVAL '1 second' ELSE security_rate_limits.expires_at END
    RETURNING hits`, [hash, windowSeconds]);
  if (Date.now() >= nextCleanup) {
    nextCleanup = Date.now() + 300_000;
    await query('DELETE FROM security_rate_limits WHERE key IN (SELECT key FROM security_rate_limits WHERE expires_at < NOW() - INTERVAL \'1 hour\' LIMIT 1000)');
  }
  if (result.rows[0].hits > limit) throw new HttpError('Bạn thao tác quá nhanh. Vui lòng thử lại sau.', 429);
}

export function securityFailure(error: unknown): Response {
  const status = error instanceof HttpError ? error.status : 500;
  return Response.json({ error: error instanceof HttpError ? error.message : 'Không thể xử lý yêu cầu.' }, {
    status, headers: { 'Cache-Control': 'private, no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) },
  });
}
