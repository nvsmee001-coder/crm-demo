import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

// Keep connection creation lazy: a production build must not need DB credentials.
const connectionString = process.env.DATABASE_URL;
const useTls = process.env.DATABASE_SSL === 'require';
const globalDatabase = globalThis as typeof globalThis & { smeePostgresPool?: Pool };

export const pool = globalDatabase.smeePostgresPool ?? new Pool({
  connectionString,
  ssl: useTls ? { rejectUnauthorized: true } : undefined,
  max: 10,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 15_000,
  application_name: 'smee-crm',
});

// Reuse the pool during Next.js hot reload. Never print connection URLs/secrets.
if (!globalDatabase.smeePostgresPool) {
  globalDatabase.smeePostgresPool = pool;
  pool.on('error', () => console.error('PostgreSQL connection unavailable.'));
}

function assertConfigured(): void {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  assertConfigured();
  return pool.query<T>(text, values);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  assertConfigured();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    client.release();
  }
}
