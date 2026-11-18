import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('DELETE FROM auth_sessions');
  await client.query('DELETE FROM auth_setup_tokens');
  await client.query('COMMIT');
  console.log('Restored login sessions and one-time setup links revoked.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Could not revoke restored sessions. Keep app stopped and inspect the database.');
  process.exitCode=1;
} finally { client.release(); await pool.end(); }
