import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('DELETE FROM auth_sessions');
  await client.query('DELETE FROM auth_setup_tokens');
  await client.query('DELETE FROM auth_mfa_recovery_codes');
  await client.query('UPDATE auth_mfa_factors SET last_step=GREATEST(last_step,floor(extract(epoch FROM now())/30)::bigint+1)');
  // A dump from before migration 005 does not include this table. Clear any
  // request keys that may refer to writes after the restored backup.
  await client.query('DELETE FROM crm_mutation_requests');
  await client.query('COMMIT');
  console.log('Restored login sessions, setup links and MFA recovery codes revoked.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Could not revoke restored sessions. Keep app stopped and inspect the database.');
  process.exitCode=1;
} finally { client.release(); await pool.end(); }
