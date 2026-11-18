import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CRMIdentity, CRMResponse, Command } from '../lib/crm-types';
import { CRMError } from '../lib/crm-engine';

// This suite resets its database. Run only against an explicitly disposable DB.
const enabled=process.env.TEST_DATABASE_RESET==='1' && !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;

function expectStatus(status:number) {
  return (error:unknown)=>error instanceof CRMError && error.status===status;
}

test('PostgreSQL persistence: isolation, revisions, atomic imports and access revocation',{skip:!enabled},async t=>{
  const {query,pool,withTransaction}=await import('../lib/database');
  const {getAccess,getAccessResponse,mutateAccess}=await import('../lib/access-store');
  const {loadWorkspace,mutateWorkspace}=await import('../lib/crm-store');
  const owner:CRMIdentity={userId:randomUUID(),email:'owner-db@example.test',displayName:'Database QA owner'};
  const teleA:CRMIdentity={userId:randomUUID(),email:'tele-a-db@example.test',displayName:'Database QA A'};
  const teleB:CRMIdentity={userId:randomUUID(),email:'tele-b-db@example.test',displayName:'Database QA B'};
  process.env.SMEE_OWNER_EMAIL=owner.email;
  try {
    const exists=(await query<{present:string|null}>("SELECT to_regclass('public.crm_workspaces')::text AS present")).rows[0].present;
    if (!exists) {
      for (const file of (await readdir(resolve('migrations'))).filter(name=>name.endsWith('.sql')).sort()) {
        await query(await readFile(resolve('migrations',file),'utf8'));
      }
    }
    await query('TRUNCATE crm_access_accounts,crm_access_control,crm_access_audit,crm_workspaces,auth_users CASCADE');
    let current:CRMResponse;
    let memberA='',memberB='',accountA='',accountB='';
    let customerA='',customerB='',customerC='';
    const command=async(action:Command['action'],data:Record<string,unknown>,extra:Partial<Command>={})=>{
      current=await mutateWorkspace('live',owner,{action,data,expectedRevision:current.revision,...extra});
      return current;
    };
    await t.test('only configured verified owner can initialize an empty company',async()=>{
      await assert.rejects(getAccess(teleA),expectStatus(403));
      assert.equal((await getAccess(owner)).role,'owner');
      current=await loadWorkspace('live',owner);
      assert.equal(current.revision,0);
      assert.equal(current.data.customers.length,0);
    });
    await t.test('transaction helper rolls back failed writes',async()=>{
      await assert.rejects(withTransaction(async client=>{
        await client.query("UPDATE crm_access_control SET owner_name='must rollback' WHERE id='company'");
        throw new Error('intentional rollback');
      }),/intentional rollback/);
      assert.equal((await query<{owner_name:string}>("SELECT owner_name FROM crm_access_control WHERE id='company'")).rows[0].owner_name,owner.displayName);
    });
    await t.test('staff account creation and binding is durable and audited',async()=>{
      await command('create',{name:'Database tele A',email:teleA.email,role:'Telesales',color:'#ee3322'},{collection:'team'});
      memberA=current.data.team.find(member=>member.email===teleA.email)!.id;
      await command('create',{name:'Database tele B',email:teleB.email,role:'Telesales',color:'#ee3322'},{collection:'team'});
      memberB=current.data.team.find(member=>member.email===teleB.email)!.id;
      let access=await getAccessResponse(owner);
      access=await mutateAccess(owner,{action:'upsert',email:teleA.email,teamMemberId:memberA,role:'telesales',active:true,expectedRevision:access.revision!});
      accountA=access.accounts!.find(account=>account.email===teleA.email)!.id;
      access=await mutateAccess(owner,{action:'upsert',email:teleB.email,teamMemberId:memberB,role:'telesales',active:true,expectedRevision:access.revision!});
      accountB=access.accounts!.find(account=>account.email===teleB.email)!.id;
      assert.equal((await getAccess(teleA)).memberId,memberA);
      assert.equal((await getAccess(teleB)).memberId,memberB);
      await assert.rejects(getAccess({...teleA,userId:randomUUID()}),expectStatus(403));
      assert.equal((await query<{count:string}>("SELECT count(*)::text AS count FROM crm_access_audit WHERE action='bind_account'")).rows[0].count,'2');
    });
    await t.test('batch import commits only valid nonduplicate customers atomically',async()=>{
      await command('import_customers',{owner:'member-admin',sourceFile:'db-test.xlsx',rows:[
        {name:'Database customer A',phone:'0901111222'},
        {name:'Database customer B',phone:'0902222333'},
        {name:'Database customer C',phone:'0903333444'},
      ]});
      [customerA,customerB,customerC]=['Database customer A','Database customer B','Database customer C'].map(name=>current.data.customers.find(customer=>customer.name===name)!.id);
      const revision=current.revision;
      await assert.rejects(command('import_customers',{owner:'member-admin',sourceFile:'duplicate.xlsx',rows:[{name:'Must not commit',phone:'0904444555'},{name:'Duplicate',phone:'+84901111222'}]}),expectStatus(400));
      current=await loadWorkspace('live',owner);
      assert.equal(current.revision,revision);
      assert.equal(current.data.customers.length,3);
      assert.ok(!current.data.customers.some(customer=>customer.name==='Must not commit'));
    });
    await t.test('distribution keeps account owner, filters reads and blocks guessed staff writes',async()=>{
      await command('distribute_customers',{assignments:[{owner:memberA,ids:[customerA,customerB]},{owner:memberB,ids:[customerC]}],note:'Database handoff',nextFollowUp:'2030-01-01',allowReassign:false});
      const a=await loadWorkspace('live',teleA),b=await loadWorkspace('live',teleB);
      assert.deepEqual(a.data.customers.map(customer=>customer.id).sort(),[customerA,customerB].sort());
      assert.deepEqual(b.data.customers.map(customer=>customer.id),[customerC]);
      assert.ok(current.data.customers.every(customer=>customer.owner==='member-admin'));
      await assert.rejects(mutateWorkspace('live',teleA,{action:'add_customer_note',id:customerC,data:{body:'forbidden'},expectedRevision:current.revision}),expectStatus(403));
      await assert.rejects(mutateWorkspace('live',teleA,{action:'import_customers',data:{owner:memberA,rows:[{name:'forbidden',phone:'0909999888'}]},expectedRevision:current.revision}),expectStatus(403));
      await assert.rejects(loadWorkspace('demo',teleA),expectStatus(403));
    });
    await t.test('two clients with one revision produce one commit and one conflict',async()=>{
      const revision=current.revision;
      const results=await Promise.allSettled([
        mutateWorkspace('live',owner,{action:'add_customer_note',id:customerA,data:{body:'race A'},expectedRevision:revision}),
        mutateWorkspace('live',owner,{action:'add_customer_note',id:customerB,data:{body:'race B'},expectedRevision:revision}),
      ]);
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      const rejected=results.find(result=>result.status==='rejected');
      assert.ok(rejected?.status==='rejected' && rejected.reason instanceof CRMError && rejected.reason.status===409);
      current=await loadWorkspace('live',owner);
      assert.equal(current.revision,revision+1);
    });
    await t.test('account disable revokes sessions, denies access and excludes recipients',async()=>{
      for (const identity of [teleA,teleB]) {
        await query('INSERT INTO auth_users (id,email,display_name,password_hash) VALUES ($1,$2,$3,$4)',[identity.userId,identity.email,identity.displayName,'fixture-not-a-valid-password-hash']);
        await query("INSERT INTO auth_sessions (token_hash,user_id,credential_version,expires_at) VALUES ($1,$2,1,now()+interval '1 hour')",['fixture-'+identity.userId,identity.userId]);
      }
      await query("INSERT INTO auth_setup_tokens (token_hash,email,crm_account_id,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')",['fixture-reset-token',teleB.email,accountB]);
      let access=await getAccessResponse(owner);
      access=await mutateAccess(owner,{action:'set_status',id:accountB,active:false,expectedRevision:access.revision!});
      await assert.rejects(getAccess(teleB),expectStatus(403));
      assert.equal((await query('SELECT token_hash FROM auth_sessions WHERE user_id=$1',[teleB.userId])).rowCount,0);
      assert.equal((await query('SELECT token_hash FROM auth_setup_tokens WHERE crm_account_id=$1',[accountB])).rowCount,0);
      current=await loadWorkspace('live',owner);
      assert.ok(!current.telesalesAssignees?.some(member=>member.id===memberB));
      await assert.rejects(command('distribute_customers',{assignments:[{owner:memberB,ids:[customerA]}],note:'Must fail',nextFollowUp:'2030-01-01',allowReassign:true}),expectStatus(400));
      access=await mutateAccess(owner,{action:'set_status',id:accountB,active:true,expectedRevision:access.revision!});
      assert.equal((await getAccess(teleB)).role,'telesales');
      assert.equal((await query('SELECT token_hash FROM auth_sessions WHERE user_id=$1',[teleB.userId])).rowCount,0);
    });
    await t.test('role changes revoke sessions and linked members cannot be deleted',async()=>{
      const access=await getAccessResponse(owner);
      await mutateAccess(owner,{action:'upsert',id:accountA,role:'account',expectedRevision:access.revision!});
      assert.equal((await query('SELECT token_hash FROM auth_sessions WHERE user_id=$1',[teleA.userId])).rowCount,0);
      current=await loadWorkspace('live',owner);
      assert.ok(!current.telesalesAssignees?.some(member=>member.id===memberA));
      await assert.rejects(command('delete',{}, {collection:'team',id:memberA}),expectStatus(400));
      const updated=await getAccessResponse(owner);
      await assert.rejects(mutateAccess(owner,{action:'set_status',id:accountA,active:false,expectedRevision:updated.revision!-1}),expectStatus(409));
    });
    await t.test('reassignment removes the previous employee access immediately',async()=>{
      current=await loadWorkspace('live',owner);
      await command('distribute_customers',{assignments:[{owner:memberB,ids:[customerA,customerB]}],note:'Transfer complete',nextFollowUp:'2030-01-01',allowReassign:true});
      const old=await loadWorkspace('live',teleA),next=await loadWorkspace('live',teleB);
      assert.equal(old.data.customers.length,0);
      assert.equal(next.data.customers.length,3);
      await assert.rejects(mutateWorkspace('live',teleA,{action:'add_customer_note',id:customerA,data:{body:'forbidden after transfer'},expectedRevision:current.revision}),expectStatus(403));
    });
  } finally {
    await pool.end();
  }
});
