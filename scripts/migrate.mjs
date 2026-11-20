import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before running migrations.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1,
  ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: true } : undefined,
  connectionTimeoutMillis: 10000, statement_timeout: 120000 });
const db = await pool.connect();
try {
  // One lock across deploy processes prevents two containers applying the same migration.
  await db.query('SELECT pg_advisory_lock(736633001)');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT NOW())');
  const dir = new URL('../migrations/', import.meta.url);
  const files = (await readdir(dir)).filter(name => /^\d+-[a-z0-9-]+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error('No migrations found.');
  for (const name of files) {
    const sql = await readFile(new URL(name, dir), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await db.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error('Migration checksum changed: ' + name);
      continue;
    }
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
      await db.query('COMMIT');
      console.log('Applied ' + name);
    } catch (error) {
      await db.query('ROLLBACK');
      // PostgreSQL errors may include an entire customer row in their detail.
      console.error('Migration failed:',name,'PostgreSQL code:',error?.code ?? '-',
        'table:',error?.table ?? '-', 'constraint:',error?.constraint ?? '-');
      throw new Error('Migration rolled back: '+name);
    }
  }
  console.log('Database migrations are up to date.');
} finally {
  await db.query('SELECT pg_advisory_unlock(736633001)').catch(() => undefined);
  db.release(); await pool.end();
}
