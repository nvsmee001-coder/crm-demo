import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { pool } from '../lib/database';
import { readWorkspaceRecords } from '../lib/workspace-tables';

const dryRun=process.argv.slice(2).includes('--dry-run');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before checking workspace tables.');

const client=await pool.connect();
try {
  await client.query(dryRun ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '120s'");
  const installed=(await client.query<{name:string|null}>("SELECT to_regclass('crm_company_settings')::text AS name")).rows[0].name;
  if (dryRun && installed) throw new Error('Dry run requires a copy with schema from before migration 006.');
  if (!dryRun && !installed) throw new Error('Workspace tables are missing. Use --dry-run on a copy or apply migration 006 first.');
  if (dryRun) {
    await client.query(await readFile(new URL('../migrations/006-workspace-tables.sql',import.meta.url),'utf8'));
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  }
  const result=await client.query<{id:string; data:string; revision:number; migrated_revision:number|null}>(`
    SELECT w.id,w.data,w.revision,s.migrated_revision
    FROM crm_workspaces w LEFT JOIN crm_company_settings s ON s.workspace_id=w.id ORDER BY w.id`);
  for (const row of result.rows) {
    if (row.migrated_revision===null) throw new Error('Workspace has no matching settings row.');
    const stored=await readWorkspaceRecords(client,row.id);
    const archive=JSON.parse(row.data);
    const canCompare=row.revision===row.migrated_revision && Object.hasOwn(archive,'settings');
    if (canCompare) {
      archive.changes??=[];
      const grouped=stored as unknown as Record<string,unknown>;
      if (!isDeepStrictEqual(archive,grouped)) {
        const groups=[...new Set([...Object.keys(archive),...Object.keys(grouped)])];
        const differences=groups.filter(key=>!isDeepStrictEqual(archive[key],grouped[key]));
        const collectionNames=['team','customers','services','projects','deals','tasks','contents','changes','issues','assets','activities','settings'];
        const labels=collectionNames.filter(key=>differences.includes(key));
        throw new Error('Archive comparison failed in: '+(labels.join(', ') || 'workspace metadata'));
      }
    }
    const receipts=stored.projects.reduce((count,project)=>count+(project.ledger?.receipts.length ?? 0),0);
    console.log(JSON.stringify({mode:row.id==='smee:live'?'live':row.id==='smee:demo'?'demo':'other',revision:row.revision,
      archiveCompared:canCompare,customers:stored.customers.length,deals:stored.deals.length,projects:stored.projects.length,
      team:stored.team.length,activities:stored.activities.length,receipts}));
  }
  console.log(dryRun?'Dry run passed. Rolling back all schema changes.':'Workspace table checks passed.');
} catch (error) {
  if (error instanceof Error && 'code' in error) {
    const dbError=error as Error & {code: string;constraint?:string;table?:string};
    console.error('Workspace check failed. PostgreSQL code:',dbError.code,'table:',dbError.table ?? '-', 'constraint:',dbError.constraint ?? '-');
  } else console.error(error instanceof Error ? error.message : 'Workspace check failed.');
  process.exitCode=1;
} finally {
  await client.query('ROLLBACK').catch(()=>undefined);
  client.release();
  await pool.end();
}
