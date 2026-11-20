import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CRMIdentity, CRMResponse, Command } from '../lib/crm-types';
import { businessDate, CRMError } from '../lib/crm-engine';
import { projectBalance } from '../lib/project-collections';

// This suite resets its database. Run only against an explicitly disposable DB.
const enabled=process.env.TEST_DATABASE_RESET==='1' && !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;

function expectStatus(status:number) {
  return (error:unknown)=>error instanceof CRMError && error.status===status;
}

test('PostgreSQL persistence: isolation, revisions, atomic imports and access revocation',{skip:!enabled},async t=>{
  const {query,pool,withTransaction}=await import('../lib/database');
  const {getAccess,getAccessResponse,mutateAccess}=await import('../lib/access-store');
  const {loadWorkspace,mutateWorkspace,previewStaffExcel}=await import('../lib/crm-store');
  const owner:CRMIdentity={userId:randomUUID(),email:'owner-db@example.test',displayName:'Database QA owner'};
  const teleA:CRMIdentity={userId:randomUUID(),email:'tele-a-db@example.test',displayName:'Database QA A'};
  const teleB:CRMIdentity={userId:randomUUID(),email:'tele-b-db@example.test',displayName:'Database QA B'};
  const sales:CRMIdentity={userId:randomUUID(),email:'sales-db@example.test',displayName:'Account khai thác'};
  process.env.SMEE_OWNER_EMAIL=owner.email;
  try {
    const exists=(await query<{present:string|null}>("SELECT to_regclass('public.crm_workspaces')::text AS present")).rows[0].present;
    if (!exists) {
      for (const file of (await readdir(resolve('migrations'))).filter(name=>name.endsWith('.sql')).sort()) {
        await query(await readFile(resolve('migrations',file),'utf8'));
      }
    }
    await query('TRUNCATE crm_mutation_requests,crm_access_accounts,crm_access_control,crm_access_audit,crm_workspaces,auth_users CASCADE');
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
    await t.test('two edits from one revision can update different customers, but a stale edit to the same customer conflicts',async()=>{
      const start=current.revision;
      const edit=(id:string, name:string)=>mutateWorkspace('live',owner,{action:'update',collection:'customers',id,data:{name},expectedRevision:start});
      await Promise.all([edit(customerA,'Concurrent customer A'),edit(customerB,'Concurrent customer B')]);
      await assert.rejects(edit(customerA,'Stale change'),expectStatus(409));
      current=await loadWorkspace('live',owner);
      assert.equal(current.revision,start+2);
      assert.equal(current.data.customers.find(customer=>customer.id===customerA)?.name,'Concurrent customer A');
      assert.equal(current.data.customers.find(customer=>customer.id===customerB)?.name,'Concurrent customer B');
    });
    await t.test('customer work cannot be assigned outside visibility and follows the new account owner', async () => {
      let access = await getAccessResponse(owner);
      access = await mutateAccess(owner,{action:'upsert',id:accountA,role:'account',expectedRevision:access.revision!});
      const work = {title:'Gọi xác nhận',type:'Cuộc gọi',dueDate:'2030-01-15',owner:memberA};
      await assert.rejects(command('upsert_customer_action',work,{id:customerC}),/quyền xem hồ sơ/);
      assert.equal((await loadWorkspace('live',owner)).revision,current.revision);
      await command('upsert_customer_action',{...work,owner:'member-admin'},{id:customerC});
      const actionId=current.data.customers.find(customer=>customer.id===customerC)!.actions![0].id;
      await command('handoff_customer',{owner:memberA,note:'Chuyển hồ sơ và việc gọi'},{id:customerC});
      const recipient=(await loadWorkspace('live',teleA)).data.customers.find(customer=>customer.id===customerC);
      assert.equal(recipient?.actions?.find(action=>action.id===actionId)?.owner,memberA);
      assert.ok(current.data.activities.some(event=>event.kind==='reassign_customer_action' && event.entityId===customerC));
      await command('handoff_customer',{owner:'member-admin',note:'Hoàn lại hồ sơ'},{id:customerC});
      await mutateAccess(owner,{action:'upsert',id:accountA,role:'telesales',expectedRevision:access.revision!});
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
    await t.test('Account creates and updates a private prospect, preserving revision, attribution and owner visibility',async()=>{
      current=await loadWorkspace('live',owner);
      await command('create',{name:'Sales thử nghiệm',email:sales.email,role:'Sales',color:'#cc4411'},{collection:'team'});
      const salesId=current.data.team.find(member=>member.email===sales.email)!.id;
      const access=await getAccessResponse(owner);
      await mutateAccess(owner,{action:'upsert',email:sales.email,teamMemberId:salesId,role:'account',active:true,expectedRevision:access.revision!});
      assert.equal((await getAccess(sales)).memberId,salesId);
      const before=await loadWorkspace('live',sales);
      assert.equal(before.data.customers.length,0);
      const create:Command={action:'create_prospect',expectedRevision:before.revision,data:{name:'Khách do Sale tìm',phone:'0901234876',source:'Giới thiệu'}};
      const next=await mutateWorkspace('live',sales,create);
      const [customer]=next.data.customers;
      assert.equal(next.data.customers.length,1);
      assert.equal(next.createdCustomerId,customer.id);
      assert.equal(customer.owner,salesId);
      assert.equal(customer.prospectedBy,salesId);
      assert.equal(customer.phone,'+84901234876');
      assert.ok(next.data.activities.some(event=>event.kind==='create_prospect' && event.entityId===customer.id && event.actor===sales.displayName));
      await assert.rejects(mutateWorkspace('live',sales,create),expectStatus(409));
      await assert.rejects(mutateWorkspace('live',sales,{...create,expectedRevision:next.revision,
        data:{name:'Số điện thoại đã có',phone:'0901111222'}}),expectStatus(400));
      const update:Command={action:'update',collection:'customers',id:customer.id,expectedRevision:next.revision,
        data:{status:'Đang tư vấn',priority:'Cao',nextAction:'Gửi báo giá',nextFollowUp:'2030-01-05'}};
      const saved=await mutateWorkspace('live',sales,update);
      assert.equal(saved.data.customers[0].priority,'Cao');
      assert.equal(saved.data.customers[0].nextAction,'Gửi báo giá');
      assert.equal(saved.data.customers[0].prospectedBy,salesId);
      current=await loadWorkspace('live',owner);
      assert.ok(current.data.customers.some(row=>row.id===customer.id && row.status==='Đang tư vấn'));
      await command('update',{owner:'member-admin'},{collection:'customers',id:customer.id});
      assert.deepEqual((await loadWorkspace('live',sales)).data.customers,[]);
      await assert.rejects(mutateWorkspace('live',sales,{...update,expectedRevision:current.revision}),expectStatus(403));
    });
    await t.test('Telesales prospects enter the creator’s call queue and follow later reassignments',async()=>{
      const access=await getAccessResponse(owner);
      await mutateAccess(owner,{action:'upsert',id:accountA,role:'telesales',expectedRevision:access.revision!});
      const before=await loadWorkspace('live',teleA);
      const create:Command={action:'create_prospect',expectedRevision:before.revision,data:{name:'Khách theo cuộc gọi'}};
      await assert.rejects(mutateWorkspace('live',teleA,create),expectStatus(400));
      const saved=await mutateWorkspace('live',teleA,{...create,data:{...create.data,phone:'0901222333'}});
      const customer=saved.data.customers.find(row=>row.id===saved.createdCustomerId)!;
      assert.equal(customer.owner,memberA);
      assert.equal(customer.prospectedBy,memberA);
      assert.equal(customer.telesalesOwner,memberA);
      assert.equal(customer.telesalesStatus,'Chờ gọi');
      assert.ok(customer.telesalesQueuedAt);
      assert.ok(!(await loadWorkspace('live',teleB)).data.customers.some(row=>row.id===customer.id));
      const call:Command={action:'log_telesales_call',expectedRevision:saved.revision,id:customer.id,
        data:{outcome:'Hẹn gọi lại',note:'Khách hẹn trao đổi tiếp',nextFollowUp:'2030-01-05'}};
      await assert.rejects(mutateWorkspace('live',teleB,call),expectStatus(403));
      const logged=await mutateWorkspace('live',teleA,call);
      assert.equal(logged.data.customers.find(row=>row.id===customer.id)?.telesalesStatus,'Hẹn gọi lại');
      current=await loadWorkspace('live',owner);
      await command('transfer_to_telesales',{owner:memberB,ids:[customer.id],note:'Đổi người phụ trách cuộc gọi'});
      assert.ok(!(await loadWorkspace('live',teleA)).data.customers.some(row=>row.id===customer.id));
      const transferred=(await loadWorkspace('live',teleB)).data.customers.find(row=>row.id===customer.id);
      assert.equal(transferred?.prospectedBy,memberA);
      assert.equal(transferred?.telesalesOwner,memberB);
    });
    await t.test('staff Excel preflight and commit share validation, ownership, privacy and revision rules',async()=>{
      current=await loadWorkspace('live',owner);
      const hiddenName='Hồ sơ chỉ quản lý thấy';
      await command('create',{name:hiddenName,owner:'member-admin',phone:'0907721000'},{collection:'customers'});
      for(const [index,user] of [sales,teleA].entries()) {
        const rows=[
          {rowNumber:4,data:{name:'Khách A',phone:'090772101'+index,source:'Sự kiện',priority:'Cao',nextAction:'Gọi lại',nextFollowUp:'2030-05-21'}},
          {rowNumber:7,data:{name:'Khách thứ hai',phone:'090772102'+index}},
          {rowNumber:12,data:{name:'Trùng công ty',phone:'+84907721000'}},
          {rowNumber:14,data:{name:'Trùng dòng trong file',phone:'090772101'+index}},
          {rowNumber:15,data:{name:'Thiếu số điện thoại',phone:''}},
        ];
        const preview=await previewStaffExcel(user,rows);
        assert.deepEqual(preview.rows.map(row=>row.status),['ready','ready','duplicate','duplicate','invalid']);
        assert.match(preview.rows[3].message,/dòng 4/);
        assert.ok(!JSON.stringify(preview).includes(hiddenName));
        assert.ok(!('owner' in preview.rows[0].customer));
        const request:Command={action:'import_prospects',expectedRevision:preview.revision,data:{sourceFile:'thu.xlsx',rows}};
        await assert.rejects(mutateWorkspace('live',user,request),(e:unknown)=>e instanceof CRMError && e.status===400 && e.message.includes('12') && !e.message.includes(hiddenName));
        assert.equal((await loadWorkspace('live',user)).revision,preview.revision);
        const forged=[{...rows[0],data:{...rows[0].data,owner:'member-admin'}}];
        await assert.rejects(previewStaffExcel(user,forged),expectStatus(403));
        await assert.rejects(mutateWorkspace('live',user,{...request,data:{...request.data,rows:forged}}),expectStatus(403));
        await assert.rejects(previewStaffExcel(user,[...rows,rows[0]]),expectStatus(400));
        await assert.rejects(previewStaffExcel(user,Array(501).fill(rows[0])),expectStatus(400));
        await assert.rejects(previewStaffExcel(owner,rows),expectStatus(403));
        const valid={...request,data:{sourceFile:'thu.xlsx',rows:rows.slice(0,2)}};
        const saved=await mutateWorkspace('live',user,valid);
        const ids=saved.createdCustomerIds!;
        assert.equal(saved.revision,preview.revision+1);
        assert.equal(ids.length,2);
        await assert.rejects(mutateWorkspace('live',user,valid),expectStatus(409));
        const imported=saved.data.customers.filter(c=>ids.includes(c.id));
        assert.equal(imported.length,2);
        assert.equal(imported[0].source,'Sự kiện');
        assert.equal(imported[0].nextFollowUp,'2030-05-21');
        for(const record of imported) {
          assert.equal(record.owner,saved.user.memberId);
          assert.equal(record.prospectedBy,saved.user.memberId);
          assert.ok(saved.data.activities.some(a=>a.kind==='import_prospects' && a.actor===user.displayName && a.entityId===record.id));
          if(user===teleA){
            assert.equal(record.telesalesOwner,memberA);
            assert.equal(record.telesalesStatus,'Chờ gọi');
            assert.ok(record.telesalesQueuedAt);
          } else assert.ok(!record.telesalesOwner);
        }
        assert.ok(!(await loadWorkspace('live',teleB)).data.customers.some(c=>ids.includes(c.id)));
      }
    });
    await t.test('a 500-row employee workbook commits in one revision',async()=>{
      const rows=Array.from({length:500},(_,index)=>({
        rowNumber:index+2,data:{name:'Khách Excel '+index,phone:'0909'+String(index).padStart(6,'0'),source:'Sự kiện'},
      }));
      const preview=await previewStaffExcel(sales,rows);
      assert.equal(preview.rows.filter(row=>row.status==='ready').length,500);
      const saved=await mutateWorkspace('live',sales,{
        action:'import_prospects',expectedRevision:preview.revision,data:{sourceFile:'500-khach.xlsx',rows},
      });
      assert.equal(saved.revision,preview.revision+1);
      assert.equal(new Set(saved.createdCustomerIds).size,500);
      assert.equal(saved.data.customers.filter(customer=>customer.name.startsWith('Khách Excel ')).length,500);
    });
    await t.test('owner receipts persist across reads, reject stale retries and preserve audit after cancellation',async()=>{
      current=await loadWorkspace('live',owner);
      await command('create',{name:'Hợp đồng đối soát',customerId:customerA,serviceId:current.data.services[0].id,owner:'member-admin',budget:1000000,scope:'Hạng mục hợp đồng'}, {collection:'projects'});
      const id=current.data.projects[0].id;
      const today=businessDate();
      await command('confirm_legacy_contract',{number:'QA-HD-01',signedOn:today,budget:1000000,evidence:'Căn cứ trong hồ sơ đối soát'},{id});
      await command('open_project_ledger',{openingAmount:300000,paymentDue:today},{id});
      const write:Command={action:'record_project_receipt',id,data:{amount:200000,date:today,reference:'QA-01'},expectedRevision:current.revision};
      const saved=await mutateWorkspace('live',owner,write);
      await assert.rejects(mutateWorkspace('live',owner,write),expectStatus(409));
      current=await loadWorkspace('live',owner);
      assert.equal(current.revision,saved.revision);
      assert.deepEqual(projectBalance(current.data.projects[0],today),{paid:500000,outstanding:500000,overdue:false});
      const receipt=current.data.projects[0].ledger!.receipts.find(r=>r.reference==='QA-01')!;
      const reason='Sai mã hợp đồng';
      await command('request_receipt_correction',{receiptId:receipt.id,kind:'void',reason},{id});
      const correctionId=current.data.projects[0].ledger!.corrections![0].id;
      await command('review_receipt_correction',{correctionId,decision:'approved'},{id});
      current=await loadWorkspace('live',owner);
      const ledger=current.data.projects[0].ledger!;
      assert.equal(ledger.receipts.find(r=>r.id===receipt.id)?.voided?.reason,reason);
      assert.equal(projectBalance(current.data.projects[0],today)?.paid,300000);
      assert.ok(current.data.activities.some(event=>event.kind==='review_receipt_correction' && event.actor===owner.displayName));
      const staff=await loadWorkspace('live',sales);
      assert.equal(staff.data.projects.length,0);
      assert.equal(staff.data.activities.some(a=>a.kind==='record_project_receipt'),false);
      await assert.rejects(mutateWorkspace('live',sales,{...write,expectedRevision:current.revision}),expectStatus(403));
      const access=await getAccessResponse(owner);
      await mutateAccess(owner,{action:'upsert',id:accountA,role:'manager',expectedRevision:access.revision!});
      const manager=await loadWorkspace('live',teleA);
      assert.deepEqual(manager.data.projects[0].ledger,ledger);
      await assert.rejects(mutateWorkspace('live',teleA,{...write,expectedRevision:manager.revision}),expectStatus(403));
      const edit:Command={action:'update',collection:'projects',id,data:{budget:310000},expectedRevision:manager.revision};
      await assert.rejects(mutateWorkspace('live',teleA,edit),expectStatus(403));
      await assert.rejects(mutateWorkspace('live',teleA,{...edit,data:{budget:1000000,scope:'Phạm vi đã cập nhật'}}),expectStatus(400));
      const proposed=await mutateWorkspace('live',teleA,{action:'request_legacy_contract_change',id,expectedRevision:manager.revision,
        data:{budget:900000,scope:'Phạm vi đã cập nhật',reason:'Theo phụ lục đã xác nhận'}});
      const changeId=proposed.data.projects[0].legacyContractChanges?.[0].id;
      current=await loadWorkspace('live',owner);
      await command('review_legacy_contract_change',{changeId,decision:'approved'},{id});
      assert.deepEqual(current.data.activities[0].details?.budget,{before:1000000,after:900000});
      assert.equal(projectBalance(current.data.projects[0],today)?.outstanding,600000);
    });
    await t.test('retrying an import with the same request ID never imports a second batch', async () => {
      current=await loadWorkspace('live',owner);
      const request:Command={action:'import_customers',requestId:randomUUID(),expectedRevision:current.revision,
        data:{owner:'member-admin',sourceFile:'retry.xlsx',rows:[{name:'Imported once',phone:'0912345670'}]}};
      const responses=await Promise.all([mutateWorkspace('live',owner,request),mutateWorkspace('live',owner,request)]);
      assert.equal(responses[0].revision,current.revision+1);
      assert.equal(responses[1].revision,responses[0].revision);
      assert.equal(responses[1].data.customers.filter(customer=>customer.name==='Imported once').length,1);
      await assert.rejects(mutateWorkspace('live',owner,{...request,data:{...request.data,sourceFile:'changed.xlsx'}}),/đã dùng/);
    });
    await t.test('workspace continues to save and reload above 1.8 MB without updating the archive', async () => {
      current=await loadWorkspace('live',owner);
      const start=current.revision;
      for (let i=0;i<36;i++) await command('add_customer_note',{body:String(i).padStart(2,'0')+'x'.repeat(28_000)},{id:customerA});
      const reloaded=await loadWorkspace('live',owner);
      assert.ok(Buffer.byteLength(JSON.stringify(reloaded.data),'utf8')>1_800_000);
      assert.equal(reloaded.revision,start+36);
      assert.equal(reloaded.data.customers.find(customer=>customer.id===customerA)?.notesLog?.[0].body.slice(0,2),'35');
      const archive=(await query<{data:string}>("SELECT data FROM crm_workspaces WHERE id='smee:live'")).rows[0].data;
      assert.equal(archive,'{}');
    });
  } finally {
    await pool.end();
  }
});
