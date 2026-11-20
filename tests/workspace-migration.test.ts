import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';
import { createWorkspace } from '../lib/crm-seed';
import { readWorkspaceRecords } from '../lib/workspace-tables';

const sql=(name:string)=>readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
async function prepareLegacy(db:PGlite) {
  const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(name=>/^00[1-5]-/.test(name)).sort();
  for (const file of files) await db.exec(await sql(file));
}

test('migration 006 preserves legacy IDs, nested history, project receipts and array order',async()=>{
  const db=await PGlite.create();
  try {
    await prepareLegacy(db);
    const legacy=createWorkspace('demo');
    const now='2026-11-20T04:00:00.000Z';
    legacy.customers[0].notesLog=[
      {id:'recent-note',body:'Second',createdAt:now,actor:'QA'},
      {id:'first-note',body:'First',createdAt:'2026-11-19T04:00:00.000Z',actor:'QA'},
    ];
    legacy.deals[0].stageHistory=[{stage:'Mới tiếp nhận',at:'2026-11-19T04:00:00.000Z',actor:'QA'},
      {stage:'Đã gửi báo giá',at:now,actor:'QA'}];
    legacy.contents[0].history=[{version:1,body:'Brief ban đầu',title:'Bản 1',url:''},
      {version:2,body:'Brief đã duyệt',title:'Bản 2',url:'',approvedAt:now,approvedBy:'QA',confirmation:'Approved'}];
    legacy.projects[0].ledger={openedAt:now,openedBy:'QA',paymentDue:'2026-12-01',receipts:[
      {id:'payment',kind:'payment',amount:250000,date:'2026-11-20',reference:'PT-1',createdAt:now,createdBy:'QA',voided:{at:now,by:'QA',reason:'Correction'}},
      {id:'opening',kind:'opening',amount:100000,date:'2026-11-19',reference:'',createdAt:now,createdBy:'QA'},
    ]};
    const original=JSON.stringify(legacy);
    await db.query("INSERT INTO crm_workspaces(id,owner_id,owner_email,data,revision,updated_at) VALUES ('smee:demo','owner','owner@example.test',$1,7,$2)",[original,now]);
    await db.query("INSERT INTO auth_users(id,email,display_name,password_hash) VALUES ('owner','owner@example.test','QA owner','fixture')");
    const migration=await sql('006-workspace-tables.sql');
    await db.transaction(tx=>tx.exec(migration));
    const client={query:db.query.bind(db)} as unknown as PoolClient;
    assert.deepEqual(await readWorkspaceRecords(client,'smee:demo'),JSON.parse(original));
    assert.equal((await db.query<{revision:number}>('SELECT revision FROM crm_workspaces')).rows[0].revision,7);
    assert.equal((await db.query('SELECT id FROM auth_users')).rows.length,1);
    await assert.rejects(db.query("UPDATE crm_workspaces SET data='{}'"),/snapshot is read-only/);
    assert.equal((await db.query<{data:string}>('SELECT data FROM crm_workspaces')).rows[0].data,original);
  } finally {await db.close();}
});

test('a broken legacy project link rolls back the migration and keeps the snapshot',async()=>{
  const db=await PGlite.create();
  try {
    await prepareLegacy(db);
    const legacy=createWorkspace('demo');
    legacy.projects[0].customerId='missing-customer';
    const original=JSON.stringify(legacy);
    await db.query("INSERT INTO crm_workspaces(id,owner_id,owner_email,data,revision,updated_at) VALUES ('smee:demo','owner','owner@example.test',$1,4,'2026-11-20')",[original]);
    const migration=await sql('006-workspace-tables.sql');
    await assert.rejects(db.transaction(tx=>tx.exec(migration)),{code:'23503'});
    assert.equal((await db.query<{relation:string|null}>("SELECT to_regclass('crm_company_settings') AS relation")).rows[0].relation,null);
    assert.equal((await db.query<{data:string}>('SELECT data FROM crm_workspaces')).rows[0].data,original);
  } finally {await db.close();}
});

test('migrations 008 and 009 preserve access records and permit delivery and finance roles',async()=>{
  const db=await PGlite.create();
  try {
    await prepareLegacy(db);
    await db.transaction(async tx=>tx.exec(await sql('006-workspace-tables.sql')));
    await db.exec(await sql('007-customer-activity-index.sql'));
    await db.query(`INSERT INTO crm_access_accounts(id,email,team_member_id,role,active,bound_user_id,version,created_at,updated_at)
      VALUES ('old','existing@example.test','old-member','account',1,'old-user',3,'2026-11-20','2026-11-20')`);
    const before=(await db.query('SELECT * FROM crm_access_accounts WHERE id=\'old\'')).rows[0];
    await db.transaction(async tx=>tx.exec(await sql('008-delivery-assignments.sql')));
    assert.deepEqual((await db.query('SELECT * FROM crm_access_accounts WHERE id=\'old\'')).rows[0],before);
    await db.query(`INSERT INTO crm_access_accounts(id,email,team_member_id,role,active,created_at,updated_at)
      VALUES ('new','delivery@example.test','new-member','delivery',1,'2026-11-20','2026-11-20')`);
    await db.transaction(async tx=>tx.exec(await sql('009-finance-role.sql')));
    assert.deepEqual((await db.query('SELECT * FROM crm_access_accounts WHERE id=\'old\'')).rows[0],before);
    assert.equal((await db.query<{role:string}>("SELECT role FROM crm_access_accounts WHERE id='new'")).rows[0].role,'delivery');
    await db.query(`INSERT INTO crm_access_accounts(id,email,team_member_id,role,active,created_at,updated_at)
      VALUES ('finance','finance@example.test','finance-member','finance',1,'2026-11-20','2026-11-20')`);
    assert.equal((await db.query<{role:string}>("SELECT role FROM crm_access_accounts WHERE id='finance'")).rows[0].role,'finance');
  } finally {await db.close();}
});
