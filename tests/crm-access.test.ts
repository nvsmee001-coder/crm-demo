import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeCommand,canReadCustomer,projectWorkspace,eligibleTelesalesAccounts} from '../lib/crm-access.js';
import {applyCommand,CRMError,normalizeWorkspace} from '../lib/crm-engine.js';
import type {AccessContext,Command,Workspace} from '../lib/crm-types.js';
import {COLLECTION_ACTIONS} from '../lib/crm-types.js';

function context(role:AccessContext['role'],memberId='a'):AccessContext{return{role,memberId:role==='owner'?undefined:memberId,userId:`uid-${memberId}`,email:`${memberId}@example.test`,name:memberId,ownerId:'uid-owner',ownerEmail:'owner@example.test',accountId:`account-${memberId}`,accountVersion:1};}
function fixture():Workspace{
  const w:Workspace={customers:[],deals:[],team:[],activities:[],services:[{id:'service-a',name:'Dịch vụ A',category:'Marketing',price:100,unit:'gói',duration:30,deliverables:'Nội dung',exclusions:'',revisions:2,active:true},{id:'service-b',name:'SECRET_SERVICE_B',category:'Marketing',price:200,unit:'gói',duration:30,deliverables:'Nội dung',exclusions:'',revisions:2,active:true}],projects:[{id:'project-secret',name:'SECRET_FINANCE',customerId:'customer-b',serviceId:'service-b',owner:'b',status:'Đang triển khai',startDate:'2026-11-01',dueDate:'2026-12-01',originalDueDate:'2026-12-01',budget:100000000,cost:70000000,scope:'Phạm vi',exclusions:'',revisions:2,acceptance:''}],tasks:[],contents:[],issues:[],assets:[{id:'asset-secret',name:'SECRET_FILE',category:'Nội bộ',industry:'',serviceId:'service-b',description:'Tài liệu nội bộ',url:'https://example.test/SECRET_FILE',shareable:false,watermark:false}],changes:[],settings:{companyName:'SMEE',slogan:'CRM',escalationHours:24,currency:'VND'}};
  const customer={id:'base',name:'Khách',industry:'Dịch vụ',contact:'Người liên hệ',email:'contact@example.test',phone:'',owner:'b',status:'Mới',notes:''};
  const deal={id:'deal-base',name:'Cơ hội',customerId:'base',serviceId:'service-a',value:10000000,stage:'Đang tư vấn',owner:'b',closeDate:'2026-12-01',nextAction:'Gọi lại',scope:'Nội dung'};
  w.team=[{id:'a',name:'Nhân viên A',email:'a@example.test',role:'Telesales',color:'#ff6600'},{id:'b',name:'Nhân viên B',email:'b@example.test',role:'Account',color:'#008800'},{id:'secret-staff',name:'SECRET_STAFF',email:'secret-staff@example.test',role:'Quản lý',color:'#880000'}];
  w.customers=[{...structuredClone(customer),id:'customer-a',name:'Khách A',owner:'b',telesalesOwner:'a',relationships:[{customerId:'customer-b',label:'SECRET_RELATION'},{customerId:'customer-c',label:'Cùng nhóm'}],actions:[{id:'action-own',owner:'a',title:'Việc A',type:'Cuộc gọi',dueDate:'2026-12-01',status:'Cần làm',notes:'',createdAt:'2026-11-18T00:00:00Z',updatedAt:'2026-11-18T00:00:00Z'},{id:'action-other',owner:'b',title:'Việc B',type:'Công việc',dueDate:'2026-12-01',status:'Cần làm',notes:'',createdAt:'2026-11-18T00:00:00Z',updatedAt:'2026-11-18T00:00:00Z'}]},
    {...structuredClone(customer),id:'customer-b',name:'SECRET_CUSTOMER_B',owner:'a',telesalesOwner:'b',notes:'SECRET_B_NOTES',relationships:[],actions:[]},
    {...structuredClone(customer),id:'customer-c',name:'Khách C',owner:'b',telesalesOwner:'a',relationships:[],actions:[]}];
  w.deals=[{...structuredClone(deal),id:'deal-a',customerId:'customer-a',owner:'b',serviceId:w.services[0].id,projectId:'SECRET_PROJECT_LINK'},{...structuredClone(deal),id:'deal-b',name:'SECRET_DEAL_B',customerId:'customer-b',owner:'a',serviceId:w.services[1].id}];
  w.activities=[{id:'event-a',text:'Ghi chú A',entityId:'customer-a',actor:'Nhân viên A',time:'2026-11-18T00:00:00Z',kind:'update',details:{hidden:{before:'SECRET_OLD',after:{customerId:'customer-b'}}}},
    {id:'event-b',text:'SECRET_EVENT_B',entityId:'customer-b',actor:'Nhân viên B',time:'2026-11-18T00:00:00Z',kind:'update'},
    {id:'event-global',text:'SECRET_SETTINGS',actor:'Quản trị',time:'2026-11-18T00:00:00Z',kind:'settings'},
    {id:'event-deal-a',text:'Cơ hội A',entityId:'deal-a',actor:'Nhân viên B',time:'2026-11-18T00:00:00Z',kind:'update'}];
  return normalizeWorkspace(w);
}
function denied(fn:()=>unknown){assert.throws(fn,(error:unknown)=>error instanceof CRMError && error.status===403);}
function auth(w:Workspace,ctx:AccessContext,command:Partial<Command>){authorizeCommand(w,{action:'log_contact',expectedRevision:0,...command} as Command,ctx);}

test('only owner writes collection records, managers can review and staff cannot read receipt activity', () => {
  const w=fixture();
  const projectId=w.projects[0].id;
  for(const action of COLLECTION_ACTIONS) {
    const command={action,id:projectId,data:{openingAmount:0},expectedRevision:0};
    assert.doesNotThrow(()=>authorizeCommand(w,command,context('owner')));
    for(const role of ['manager','account','telesales'] as const) {
      denied(()=>authorizeCommand(w,command,context(role)));
      denied(()=>applyCommand(w,command,'Nhân viên',undefined,context(role)));
    }
  }
  const withLedger=applyCommand(w,{action:'open_project_ledger',id:projectId,data:{openingAmount:1200},expectedRevision:0},'Chủ',undefined,context('owner'));
  assert.deepEqual(projectWorkspace(withLedger,context('manager')).projects[0].ledger,withLedger.projects[0].ledger);
  for(const role of ['account','telesales'] as const) {
    const projected=projectWorkspace(withLedger,context(role));
    assert.equal(projected.projects.length,0);
    assert.ok(!projected.activities.some(a=>a.kind==='open_project_ledger'));
  }
});

test('owner and manager receive all business records and projections do not mutate stored state',()=>{
  const w=fixture();for(const role of ['owner','manager'] as const){const view=projectWorkspace(w,context(role));assert.deepEqual(view,w);view.customers[0].name='Changed';assert.equal(w.customers[0].name,'Khách A');assert.doesNotThrow(()=>auth(w,context(role),{action:'update_settings'}));}
});
test('telesales visibility follows telesales assignment only; account visibility follows account owner only',()=>{
  const w=fixture();assert.deepEqual(projectWorkspace(w,context('telesales')).customers.map(c=>c.id),['customer-a','customer-c']);assert.deepEqual(projectWorkspace(w,context('account')).customers.map(c=>c.id),['customer-b']);assert.equal(canReadCustomer(w.customers[1],context('telesales')),false);assert.equal(canReadCustomer(w.customers[0],context('account')),false);
});
test('employee projections strip hidden relationships, files/financial collections, project ids and activity details',()=>{
  const view=projectWorkspace(fixture(),context('telesales'));assert.deepEqual(view.customers[0].relationships,[{customerId:'customer-c',label:'Cùng nhóm'}]);assert.equal(view.deals.length,1);assert.equal(view.deals[0].projectId,undefined);assert.equal(view.services.length,1);assert.equal(view.activities.length,2);assert.ok(view.activities.every(event=>event.details===undefined));
  for(const key of ['projects','tasks','contents','issues','assets','changes'] as const)assert.deepEqual(view[key],[]);
  const json=JSON.stringify(view);for(const hidden of ['SECRET_CUSTOMER_B','SECRET_B_NOTES','SECRET_DEAL_B','SECRET_RELATION','SECRET_PROJECT_LINK','SECRET_OLD','SECRET_EVENT_B','SECRET_SETTINGS','SECRET_STAFF','b@example.test','secret-staff@example.test'])assert.equal(json.includes(hidden),false,hidden);assert.equal(view.team.find(member=>member.id==='a')?.email,'a@example.test');
});
test('employees cannot mutate guessed/unassigned customers or self-assign data, accounts, finance or files',()=>{
  const w=fixture(),ctx=context('telesales');for(const id of ['customer-b','missing'])denied(()=>auth(w,ctx,{id,action:'log_contact'}));
  for(const data of [{owner:'a'},{telesalesOwner:'a'},{relationships:[]},{avatarUrl:'/api/uploads/12345678-1234-1234-1234-123456789abc/x.png'},{actions:[]},{notesLog:[]}])denied(()=>auth(w,ctx,{id:'customer-a',action:'update',collection:'customers',data}));
  for(const action of ['create','delete','bulk_update_customers','transfer_to_telesales','handoff_customer','handoff','win_deal','update_settings','update_customer_note'] as const)denied(()=>auth(w,ctx,{id:'customer-a',action,collection:'customers'}));
  denied(()=>auth(w,ctx,{id:'customer-a',action:'update',collection:'team',data:{name:'Fake role'}}));denied(()=>auth(w,ctx,{id:'deal-a',action:'update',collection:'deals',data:{value:0}}));
});
test('assigned employees can edit allowed contact fields and record notes/contact but never edit old notes',()=>{
  const w=fixture(),ctx=context('telesales');for(const command of [{action:'update',collection:'customers',data:{phone:'0912345678',background:'Nhu cầu',favorite:true,nextFollowUp:'2026-12-01',nextAction:'Gọi lại'}},{action:'add_customer_note',data:{body:'Nội dung'}},{action:'log_contact',data:{channel:'Điện thoại',outcome:'Gọi lại',note:'Nội dung'}}] as Partial<Command>[])assert.doesNotThrow(()=>auth(w,ctx,{id:'customer-a',...command}));denied(()=>auth(w,ctx,{id:'customer-a',action:'update_customer_note',data:{noteId:'own-looking-name',body:'Không được đổi'}}));
});
test('customer actions must be owned by the current employee for create, edit, completion and cancellation',()=>{
  const w=fixture(),ctx=context('telesales');assert.doesNotThrow(()=>auth(w,ctx,{id:'customer-a',action:'upsert_customer_action',data:{owner:'a'}}));
  for(const action of ['upsert_customer_action','complete_customer_action','cancel_customer_action'] as const){assert.doesNotThrow(()=>auth(w,ctx,{id:'customer-a',action,data:{actionId:'action-own',owner:'a'}}));denied(()=>auth(w,ctx,{id:'customer-a',action,data:{actionId:'action-other',owner:'a'}}));}
  denied(()=>auth(w,ctx,{id:'customer-a',action:'upsert_customer_action',data:{owner:'b'}}));denied(()=>auth(w,ctx,{id:'customer-a',action:'upsert_customer_action',data:{owner:'Nhân viên A'}}));
});
test('telesales call requires both readable customer scope and exact telesales assignment',()=>{
  const w=fixture();assert.doesNotThrow(()=>auth(w,context('telesales'),{id:'customer-a',action:'log_telesales_call'}));denied(()=>auth(w,context('account'),{id:'customer-b',action:'log_telesales_call'}));denied(()=>auth(w,context('telesales'),{id:'customer-b',action:'log_telesales_call'}));
});
test('authorized employee mutations apply to full state and preserve every hidden record before projection',()=>{
  const w=fixture(),ctx=context('telesales'),command:Command={action:'add_customer_note',id:'customer-a',data:{body:'Ghi chú mới'},expectedRevision:0};authorizeCommand(w,command,ctx);const next=applyCommand(w,command,ctx.name,'2026-11-18T08:00:00Z');assert.deepEqual(next.customers[1],w.customers[1]);assert.deepEqual(next.projects,w.projects);assert.equal(next.customers.length,3);assert.equal(projectWorkspace(next,ctx).customers.length,2);assert.equal(next.customers[0].notesLog?.[0].body,'Ghi chú mới');
});
test('assignment changes immediately remove prior visibility and write authority',()=>{
  const w=fixture(),ctx=context('telesales');assert.equal(projectWorkspace(w,ctx).customers.length,2);w.customers[0].telesalesOwner='b';assert.deepEqual(projectWorkspace(w,ctx).customers.map(c=>c.id),['customer-c']);denied(()=>auth(w,ctx,{id:'customer-a',action:'add_customer_note'}));
});

test('live telesales recipients require active access roles and linked team membership',()=>{
  const w=fixture();
  const accounts=[
    {id:'ok',team_member_id:'a',role:'telesales',active:1,version:4},
    {id:'inactive',team_member_id:'b',role:'telesales',active:0,version:1},
    {id:'wrong-role',team_member_id:'a',role:'account',active:1,version:1},
    {id:'missing-member',team_member_id:'gone',role:'telesales',active:1,version:1},
  ];
  assert.deepEqual(eligibleTelesalesAccounts(w,accounts),[accounts[0]]);
  // A display role in the team table never grants account-level telesales eligibility.
  w.team[1].role='Telesales';assert.deepEqual(eligibleTelesalesAccounts(w,accounts),[accounts[0]]);
});
test('prospecting accepts linked staff and rejects externally supplied assignment or history',()=>{
  const workspace=fixture();
  const account=context('account');
  const create:Command={action:'create_prospect',expectedRevision:0,data:{name:'Công ty mới'}};
  assert.doesNotThrow(()=>authorizeCommand(workspace,create,account));
  assert.doesNotThrow(()=>authorizeCommand(workspace,create,context('telesales')));
  for(const role of ['owner','manager'] as const){
    denied(()=>authorizeCommand(workspace,create,context(role)));
  }
  denied(()=>authorizeCommand(workspace,create,context('account','missing')));
  denied(()=>authorizeCommand(workspace,{...create,id:'customer-b'},account));
  denied(()=>authorizeCommand(workspace,{...create,collection:'team'},account));
  for(const key of ['id','owner','telesalesOwner','prospectedBy','actions','interactions','relationships']){
    denied(()=>authorizeCommand(workspace,{...create,data:{name:'Công ty mới',[key]:'b'}},account));
  }
  for(const role of ['account','telesales'] as const){
    const id=role==='account'?'customer-b':'customer-a';
    const update:Command={action:'update',collection:'customers',id,expectedRevision:0,data:{source:'Sự kiện',priority:'Cao'}};
    assert.doesNotThrow(()=>authorizeCommand(workspace,update,context(role)));
    denied(()=>authorizeCommand(workspace,{...update,data:{prospectedBy:'a'}},context(role)));
  }
});
test('only owner/manager may import or distribute, including forged assigned-customer command ids',()=>{
  const w=fixture();for(const role of ['account','telesales'] as const)for(const action of ['import_customers','distribute_customers'] as const)for(const id of [undefined,'customer-a','customer-b'])denied(()=>auth(w,context(role),{action,id,data:{owner:'a',rows:[{name:'Forged',phone:'0901234567'}],assignments:[{owner:'a',ids:['customer-b']}]}}));
  for(const role of ['owner','manager'] as const)for(const action of ['import_customers','distribute_customers'] as const)assert.doesNotThrow(()=>auth(w,context(role),{action}));
});
test('distribution changes telesales visibility without changing account ownership',()=>{
  const w=fixture();w.customers[0].phone='0901111222';w.customers[1].phone='0902222333';
  const next=applyCommand(w,{action:'distribute_customers',expectedRevision:0,data:{assignments:[{owner:'b',ids:['customer-a']},{owner:'a',ids:['customer-b']}],note:'Đổi ca',nextFollowUp:'2026-11-20',allowReassign:true}},'Quản trị','2026-11-18T00:00:00Z');
  assert.deepEqual(projectWorkspace(next,context('telesales','a')).customers.map(customer=>customer.id),['customer-b','customer-c']);assert.deepEqual(projectWorkspace(next,context('account','a')).customers.map(customer=>customer.id),['customer-b']);denied(()=>auth(next,context('telesales','a'),{id:'customer-a',action:'add_customer_note'}));
});
