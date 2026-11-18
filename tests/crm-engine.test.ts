import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, businessDate, CRMError, normalizeWorkspace, normalizePhone, normalizeTelegram, previewCustomerImport } from '../lib/crm-engine.js';
import type { Command, Workspace } from '../lib/crm-types.js';

const now='2026-11-17T18:30:00.000Z';
const run=(w:Workspace,command:Omit<Command,'expectedRevision'>)=>applyCommand(w,{...command,expectedRevision:0},'Quản trị',now);
function fixture():Workspace {
  return {
    customers:[{id:'c1',name:'Khách mẫu',industry:'Dịch vụ',contact:'An',email:'an@example.test',phone:'',owner:'m1',status:'Đang chăm sóc',notes:''}],
    services:[{id:'s1',name:'Nội dung',category:'Marketing',price:10000000,unit:'gói',duration:90,deliverables:'12 bài',exclusions:'Quay video',revisions:2,active:true}],
    deals:[{id:'d1',name:'Gói 3 tháng',customerId:'c1',serviceId:'s1',value:10000000,stage:'Đã gửi báo giá',owner:'m1',closeDate:'2026-11-18',nextAction:'Gọi lại',scope:'12 bài'}],
    projects:[{id:'p1',name:'Nội dung tháng 11',customerId:'c1',serviceId:'s1',owner:'m1',status:'Đang triển khai',startDate:'2026-11-01',dueDate:'2026-11-30',originalDueDate:'2026-11-30',budget:10000000,cost:1000000,scope:'12 bài',exclusions:'Quay video',revisions:2,acceptance:''}],
    tasks:[{id:'t1',projectId:'p1',name:'Thiết kế',owner:'m1',status:'Cần làm',dueDate:'2026-11-20',hours:2,hourlyCost:100000,notes:''}],
    contents:[{id:'ct1',projectId:'p1',title:'Nội dung 01',channel:'Facebook',batch:'Tháng 11',publishDate:'2026-11-20',status:'Chờ duyệt',owner:'m1',version:1,body:'Nội dung bản đầu',feedback:'',url:''}],
    changes:[{id:'ch1',projectId:'p1',title:'Thêm video',reason:'Khách yêu cầu',fee:2000000,extraDays:3,status:'Chờ duyệt',customerConfirmed:false,confirmation:'',createdAt:now}],
    issues:[{id:'i1',projectId:'p1',title:'Thiếu hình ảnh',description:'Chờ khách gửi',owner:'m1',priority:'Cao',status:'Đang mở',dueDate:'2026-11-19',createdAt:now}],
    assets:[],team:[{id:'m1',name:'Linh',role:'Quản lý',email:'linh@example.test',color:'#ff6b35'},{id:'m2',name:'An',role:'Account',email:'an@example.test',color:'#a1b2c3'}],activities:[],settings:{companyName:'SMEE agency',slogan:'Vận hành',escalationHours:24,currency:'VND'},
  };
}
test('retired approvals and change CRUD reject while archived data is preserved',()=>{
  const w=fixture();
  for(const action of ['approve_content','request_changes','approve_change','reject_change']) assert.throws(()=>run(w,{action:action as Command['action'],id:'ch1'}),/đã được gỡ bỏ/);
  for(const action of ['create','update','delete'] as const)assert.throws(()=>run(w,{action,collection:'changes',id:'ch1',data:{title:'Bất kỳ'}}),/đã được gỡ bỏ/);
  const next=run(w,{action:'update_settings',data:{slogan:'Mới'}});assert.deepEqual(next.changes,w.changes);assert.equal(w.contents[0].status,'Chờ duyệt');assert.equal(next.contents[0].status,'Đang sản xuất');
});
test('legacy statuses normalize without deleting approval evidence',()=>{
  const w=fixture();w.contents[0].status='Đã duyệt';w.contents[0].approvedAt=now;w.contents[0].approvedVersion=1;w.contents[0].approvalConfirmation='Bằng chứng cũ';w.customers[0].status='Tiềm năng';
  const next=normalizeWorkspace(w);assert.equal(next.contents[0].status,'Sẵn sàng đăng');assert.equal(next.contents[0].approvalConfirmation,'Bằng chứng cũ');assert.equal(next.contents[0].approvedVersion,1);assert.equal(next.customers[0].status,'Mới');assert.equal(w.contents[0].status,'Đã duyệt');
  assert.throws(()=>run(next,{action:'delete',collection:'contents',id:'ct1'}),/bằng chứng xác nhận đã lưu/);
});
test('content can publish without approval and edits preserve previous versions',()=>{
  const w=fixture();w.contents[0].approvedAt=now;w.contents[0].approvedVersion=1;w.contents[0].approvalConfirmation='Bằng chứng cũ';
  const edited=run(w,{action:'update',collection:'contents',id:'ct1',data:{body:'Bản mới'}});assert.equal(edited.contents[0].version,2);assert.equal(edited.contents[0].status,'Đang sản xuất');assert.equal(edited.contents[0].history?.[0].body,'Nội dung bản đầu');assert.equal(edited.contents[0].history?.[0].confirmation,'Bằng chứng cũ');
  const posted=run(edited,{action:'update',collection:'contents',id:'ct1',data:{status:'Đã đăng'}});assert.equal(posted.contents[0].status,'Đã đăng');assert.equal(posted.contents[0].approvedVersion,undefined);
});
test('project completion ignores archived change requests but respects open work',()=>{
  const w=fixture();assert.throws(()=>run(w,{action:'complete_project',id:'p1',data:{acceptance:'Khách nghiệm thu'}}),/công việc/);
  w.tasks[0].status='Hoàn tất';assert.throws(()=>run(w,{action:'complete_project',id:'p1',data:{acceptance:'Khách nghiệm thu'}}),/nội dung/);
  w.contents[0].status='Đã đăng';assert.throws(()=>run(w,{action:'complete_project',id:'p1',data:{acceptance:'Khách nghiệm thu'}}),/vướng mắc/);
  w.issues[0].status='Đã giải quyết';assert.throws(()=>run(w,{action:'complete_project',id:'p1'}),/Bằng chứng nghiệm thu/);
  const done=run(w,{action:'complete_project',id:'p1',data:{acceptance:'Biên bản nghiệm thu'}});assert.equal(done.projects[0].status,'Hoàn tất');assert.equal(done.changes[0].status,'Chờ duyệt');
});
test('winning a deal creates a linked project once using the Vietnam business date',()=>{
  const won=run(fixture(),{action:'win_deal',id:'d1'});assert.equal(won.projects.length,2);assert.equal(won.deals[0].stage,'Đã chốt');assert.equal(won.projects[1].startDate,'2026-11-18');assert.equal(won.projects[1].dueDate,'2027-02-16');assert.equal(won.deals[0].projectId,won.projects[1].id);
  assert.throws(()=>run(won,{action:'win_deal',id:'d1'}),/đã được chốt/);assert.equal(businessDate(now),'2026-11-18');
});
test('project commercial edits are allowed and audited while completion/handoff stays guarded',()=>{
  const w=fixture();const edited=run(w,{action:'update',collection:'projects',id:'p1',data:{budget:12000000,dueDate:'2026-12-02',scope:'14 bài',exclusions:'Video',revisions:3}});
  assert.equal(edited.projects[0].budget,12000000);assert.equal(edited.projects[0].originalDueDate,'2026-11-30');assert.deepEqual(edited.activities[0].details?.budget,{before:10000000,after:12000000});assert.deepEqual(edited.activities[0].details?.scope,{before:'12 bài',after:'14 bài'});
  for(const data of [{status:'Hoàn tất'},{owner:'m2'},{customerId:'other'}])assert.throws(()=>run(w,{action:'update',collection:'projects',id:'p1',data}),CRMError);
  assert.throws(()=>run(w,{action:'update',collection:'deals',id:'d1',data:{stage:'Đã chốt'}}),/Chốt cơ hội/);
});
test('handoff validates employee and records readable old/new owners',()=>{
  const w=fixture();assert.throws(()=>run(w,{action:'handoff',id:'p1',data:{owner:'unknown',note:'Chuyển'}}),/danh sách nhân sự/);
  const changed=run(w,{action:'handoff',id:'p1',data:{owner:'m2',note:'Bàn giao tài liệu và việc tồn'}});assert.equal(changed.projects[0].owner,'m2');assert.match(changed.activities[0].text,/từ Linh cho An/);
});
test('negative financial values, malformed dates and unsafe URLs are rejected',()=>{
  const w=fixture();for(const hours of [-1,Number.NaN,Infinity])assert.throws(()=>run(w,{action:'update',collection:'tasks',id:'t1',data:{hours}}),/không âm/);
  for(const dueDate of ['2026-02-31','2026-99-99','yesterday'])assert.throws(()=>run(w,{action:'update',collection:'tasks',id:'t1',data:{dueDate}}),/không hợp lệ/);
  for(const url of ['javascript:alert(1)','data:text/html,test','//evil.test/foo','/untrusted'])assert.throws(()=>run(w,{action:'update',collection:'contents',id:'ct1',data:{url}}),/Đường dẫn/);
  assert.doesNotThrow(()=>run(w,{action:'update',collection:'contents',id:'ct1',data:{url:'/api/uploads/12345678-1234-1234-1234-123456789abc/file.pdf'}}));
  assert.throws(()=>run(w,{action:'update',collection:'customers',id:'c1',data:{industry:{unexpected:true}}}),/industry không hợp lệ/);
});
test('referenced entities cannot be deleted and issues need resolution notes',()=>{
  const w=fixture();for(const [collection,id] of [['customers','c1'],['services','s1'],['projects','p1'],['team','m1']] as const)assert.throws(()=>run(w,{action:'delete',collection,id}),/đang được sử dụng/);
  assert.throws(()=>run(w,{action:'resolve_issue',id:'i1'}),/Kết quả/);const resolved=run(w,{action:'resolve_issue',id:'i1',data:{resolution:'Đã nhận ảnh'}});assert.equal(resolved.issues[0].status,'Đã giải quyết');assert.equal(resolved.issues[0].resolvedAt,now);
});

test('customer create normalizes Telegram and VN phone and ignores client timestamps',()=>{
  const w=fixture();const next=run(w,{action:'create',collection:'customers',data:{name:'Khách mới',owner:'m1',email:' NEW@EXAMPLE.TEST ',phone:'0912 345 678',telegram:'https://t.me/Smee_Agency',source:'Giới thiệu',priority:'Cao',nextFollowUp:'2026-11-20',nextAction:'Gọi lại',createdAt:'fake',lastContactAt:'fake'}});
  const c=next.customers.at(-1)!;assert.equal(c.phone,'+84912345678');assert.equal(c.email,'new@example.test');assert.equal(c.telegram,'smee_agency');assert.equal(c.createdAt,now);assert.equal(c.updatedAt,now);assert.equal(c.lastContactAt,undefined);assert.deepEqual(c.interactions,[]);
  assert.equal(normalizePhone('+84 (912) 345-678'),'+84912345678');assert.equal(normalizePhone('84912345678'),'+84912345678');assert.equal(normalizeTelegram('@SMEE_Agency'),'smee_agency');
});
test('phone/email duplicates are blocked on new identity changes but legacy duplicates allow unrelated edits',()=>{
  const w=fixture();w.customers[0].phone='0912 345 678';
  assert.throws(()=>run(w,{action:'create',collection:'customers',data:{name:'Trùng số',owner:'m1',phone:'+84912345678'}}),/Số điện thoại này/);
  assert.throws(()=>run(w,{action:'create',collection:'customers',data:{name:'Trùng email',owner:'m1',email:'AN@EXAMPLE.TEST'}}),/Email này/);
  w.customers.push({...w.customers[0],id:'c2',name:'Dữ liệu cũ'});
  const edited=run(w,{action:'update',collection:'customers',id:'c2',data:{notes:'Ghi chú vẫn lưu',phone:'+84 912 345 678'}});assert.equal(edited.customers[1].notes,'Ghi chú vẫn lưu');
  w.customers[1].phone='0987 654 321';w.customers[1].email='another@example.test';
  assert.throws(()=>run(w,{action:'update',collection:'customers',id:'c2',data:{phone:'+84912345678'}}),/Số điện thoại này/);
  assert.throws(()=>run(w,{action:'update',collection:'customers',id:'c2',data:{email:'AN@example.test'}}),/Email này/);
});
test('contact logging records server timestamp and actor while updating next followup',()=>{
  const w=fixture();w.customers[0].notes='Hồ sơ gốc';
  assert.throws(()=>run(w,{action:'log_contact',id:'c1',data:{channel:'Telegram',outcome:'Hẹn lại'}}),/Ghi chú liên hệ/);
  assert.throws(()=>run(w,{action:'log_contact',id:'c1',data:{channel:'Sai',outcome:'Hẹn lại',note:'Gọi'}}),/Kênh liên hệ/);
  const next=run(w,{action:'log_contact',id:'c1',data:{channel:'Điện thoại',outcome:'Hẹn liên hệ lại',note:'Khách muốn nhận giới thiệu dịch vụ',nextFollowUp:'2026-11-20',nextAction:'Gửi tài liệu',at:'fake',actor:'fake'}});
  const c=next.customers[0];assert.equal(c.lastContactAt,now);assert.equal(c.updatedAt,now);assert.equal(c.nextFollowUp,'2026-11-20');assert.equal(c.nextAction,'Gửi tài liệu');assert.equal(c.notes,'Hồ sơ gốc');assert.equal(c.interactions?.[0].at,now);assert.equal(c.interactions?.[0].actor,'Quản trị');assert.equal(c.interactions?.[0].channel,'Điện thoại');
  assert.equal(w.customers[0].interactions,undefined);assert.equal(next.activities[0].kind,'log_contact');
});
test('bulk customer update is atomic, limited and audits each reassignment',()=>{
  const w=fixture();w.customers.push({...w.customers[0],id:'c2',name:'Khách 2'});
  assert.throws(()=>run(w,{action:'bulk_update_customers',data:{ids:['c1','missing'],owner:'m2'}}),/không tồn tại/);assert.equal(w.customers[0].owner,'m1');
  assert.throws(()=>run(w,{action:'bulk_update_customers',data:{ids:['c1'],status:'Sai'}}),/Trạng thái/);
  assert.throws(()=>run(w,{action:'bulk_update_customers',data:{ids:Array(501).fill('c1'),owner:'m2'}}),/500/);
  const next=run(w,{action:'bulk_update_customers',data:{ids:['c1','c2'],owner:'m2',status:'Đang tư vấn',priority:'Cao',nextFollowUp:'2026-11-21'}});
  assert.ok(next.customers.every(c=>c.owner==='m2' && c.status==='Đang tư vấn' && c.priority==='Cao' && c.nextFollowUp==='2026-11-21'));assert.equal(next.activities.length,2);assert.ok(next.activities.every(a=>a.text.includes('Linh → An')));assert.equal(next.activities[0].details?.owner?.before,'m1');
});
test('customer handoff preserves followup, profile notes and interaction history',()=>{
  const w=fixture();w.customers[0].notes='Khách thích nội dung ngắn';w.customers[0].nextFollowUp='2026-11-22';w.customers[0].nextAction='Gọi lại';
  assert.throws(()=>run(w,{action:'handoff_customer',id:'c1',data:{owner:'m2'}}),/Nội dung bàn giao/);
  const next=run(w,{action:'handoff_customer',id:'c1',data:{owner:'m2',note:'Đã bàn giao thông tin tư vấn'}});const c=next.customers[0];assert.equal(c.owner,'m2');assert.equal(c.notes,'Khách thích nội dung ngắn');assert.equal(c.nextFollowUp,'2026-11-22');assert.equal(c.nextAction,'Gọi lại');assert.equal(c.lastContactAt,undefined);assert.match(next.activities[0].text,/từ Linh cho An/);
});
test('invalid contact fields and malformed optional followup dates are rejected',()=>{
  const w=fixture();for(const data of [{phone:'call-me'},{telegram:'https://evil.test/smee_agency'},{telegram:'javascript:alert(1)'},{priority:'Rất cao'},{nextFollowUp:'2026-02-31'},{email:{bad:true}}])assert.throws(()=>run(w,{action:'update',collection:'customers',id:'c1',data}),CRMError);
  assert.throws(()=>run(w,{action:'log_contact',id:'c1',data:{channel:'Email',outcome:'Đã gửi',note:'Tài liệu',nextFollowUp:0}}),/Ngày liên hệ tiếp/);
});

test('telesales defaults normalize non-destructively and generic edits cannot forge queue fields',()=>{
  const w=fixture();w.customers[0].telegram='legacy_account';
  const normalized=normalizeWorkspace(w);assert.equal(normalized.customers[0].telesalesOwner,'');assert.equal(normalized.customers[0].telesalesStatus,'Chưa chuyển');assert.equal(normalized.customers[0].telesalesAttempts,0);assert.equal(normalized.customers[0].telegram,'legacy_account');assert.equal(w.customers[0].telesalesStatus,undefined);
  const updated=run(normalized,{action:'update',collection:'customers',id:'c1',data:{telesalesOwner:'m2',telesalesStatus:'Đủ điều kiện',telesalesAttempts:999}});assert.equal(updated.customers[0].telesalesOwner,'');assert.equal(updated.customers[0].telesalesAttempts,0);
  const created=run(w,{action:'create',collection:'customers',data:{name:'Mới',owner:'m1',telesalesOwner:'m2',telesalesQueuedAt:'fake',telesalesAttempts:99}});assert.equal(created.customers.at(-1)?.telesalesOwner,'');assert.equal(created.customers.at(-1)?.telesalesAttempts,0);assert.equal(created.customers.at(-1)?.telesalesQueuedAt,undefined);
});
test('telesales transfer validates all phones/staff atomically and leaves account owner unchanged',()=>{
  const w=fixture();w.customers[0].phone='0912 345 678';w.customers.push({...w.customers[0],id:'c2',name:'Thiếu số',phone:''});
  assert.throws(()=>run(w,{action:'transfer_to_telesales',data:{ids:['c1','c2'],owner:'m2',note:'Gọi tư vấn'}}),/Thiếu số chưa có số điện thoại hợp lệ/);assert.equal(w.customers[0].telesalesOwner,undefined);
  assert.throws(()=>run(w,{action:'transfer_to_telesales',data:{ids:['c1'],owner:'missing',note:'Gọi tư vấn'}}),/danh sách nhân sự/);
  assert.throws(()=>run(w,{action:'transfer_to_telesales',data:{ids:['c1'],owner:'m2',note:''}}),/Ghi chú chuyển telesales/);
  assert.throws(()=>run(w,{action:'transfer_to_telesales',data:{ids:Array(501).fill('c1'),owner:'m2',note:'Gọi tư vấn'}}),/500/);
  const next=run(w,{action:'transfer_to_telesales',data:{ids:['c1'],owner:'m2',note:'Ưu tiên gọi buổi chiều',nextFollowUp:'2026-11-20'}});const c=next.customers[0];assert.equal(c.owner,'m1');assert.equal(c.telesalesOwner,'m2');assert.equal(c.telesalesStatus,'Chờ gọi');assert.equal(c.telesalesQueuedAt,now);assert.equal(c.telesalesHandoffNote,'Ưu tiên gọi buổi chiều');assert.equal(c.nextFollowUp,'2026-11-20');assert.equal(next.activities[0].kind,'transfer_to_telesales');assert.equal(next.activities[0].details?.telesalesOwner.after,'m2');
});
test('explicit telesales requeue and reassignment preserve attempts, last call and interaction history',()=>{
  const w=fixture();w.customers[0].phone='0912 345 678';w.customers[0].telesalesOwner='m2';w.customers[0].telesalesStatus='Sai số';w.customers[0].telesalesAttempts=3;w.customers[0].telesalesLastOutcome='Sai số';w.customers[0].telesalesLastCallAt='2026-11-16T10:00:00Z';w.customers[0].interactions=[{id:'old-call',at:'2026-11-16T10:00:00Z',channel:'Điện thoại',outcome:'Sai số',note:'Nhờ account xác nhận lại',actor:'An'}];
  const requeued=run(w,{action:'transfer_to_telesales',data:{ids:['c1'],owner:'m2',note:'Account đã xác nhận lại số'}});const c=requeued.customers[0];assert.equal(c.telesalesStatus,'Chờ gọi');assert.equal(c.telesalesAttempts,3);assert.equal(c.telesalesLastCallAt,'2026-11-16T10:00:00Z');assert.equal(c.telesalesLastOutcome,'Sai số');assert.equal(c.interactions?.length,1);
  const moved=run(requeued,{action:'transfer_to_telesales',data:{ids:['c1'],owner:'m1',note:'Chuyển ca trực mới'}});assert.equal(moved.customers[0].telesalesOwner,'m1');assert.equal(moved.customers[0].telesalesAttempts,3);assert.equal(moved.activities.length,2);assert.match(moved.activities[0].text,/An → Linh/);
});
test('telesales cannot log unassigned, closed, invalid-phone or impossible calls',()=>{
  const w=fixture();const payload={outcome:'Quan tâm',note:'Có trao đổi'};
  assert.throws(()=>run(w,{action:'log_telesales_call',id:'c1',data:payload}),/hàng chờ gọi/);
  w.customers[0].telesalesOwner='m2';w.customers[0].telesalesStatus='Chờ gọi';assert.throws(()=>run(w,{action:'log_telesales_call',id:'c1',data:payload}),/số điện thoại hợp lệ/);
  w.customers[0].phone='0912345678';assert.throws(()=>run(w,{action:'log_telesales_call',id:'c1',data:{outcome:'Tự đặt',note:'Có trao đổi'}}),/Kết quả cuộc gọi/);
  assert.throws(()=>run(w,{action:'log_telesales_call',id:'c1',data:{outcome:'Quan tâm',note:''}}),/Ghi chú cuộc gọi/);
  for(const status of ['Đủ điều kiện','Không phù hợp','Sai số'] as const){w.customers[0].telesalesStatus=status;assert.throws(()=>run(w,{action:'log_telesales_call',id:'c1',data:payload}),/xếp lại/);}
});
test('no-answer, busy and callback telesales outcomes require a valid followup date',()=>{
  const w=fixture();w.customers[0].phone='0912345678';const queued=run(w,{action:'transfer_to_telesales',data:{ids:['c1'],owner:'m2',note:'Gọi khách'}});
  for(const outcome of ['Không nghe máy','Máy bận','Hẹn gọi lại']) {
    for(const nextFollowUp of [undefined,'','2026-02-31'])assert.throws(()=>run(queued,{action:'log_telesales_call',id:'c1',data:{outcome,note:'Hẹn gọi',nextFollowUp}}),/Ngày gọi lại/);
    const called=run(queued,{action:'log_telesales_call',id:'c1',data:{outcome,note:'Gọi lại theo lịch',nextFollowUp:'2026-11-20',nextAction:'Gọi lại buổi chiều'}});assert.equal(called.customers[0].nextFollowUp,'2026-11-20');assert.equal(called.customers[0].telesalesStatus,outcome==='Hẹn gọi lại'?'Hẹn gọi lại':'Đang chăm sóc');
  }
});
test('telesales outcome mapping uses server call history and clears terminal followups',()=>{
  const mappings={'Quan tâm':'Đủ điều kiện','Đặt lịch tư vấn':'Đủ điều kiện','Không phù hợp':'Không phù hợp','Sai số':'Sai số'};
  for(const [outcome,status] of Object.entries(mappings)) {
    const w=fixture();w.customers[0].phone='0912345678';w.customers[0].nextFollowUp='2026-11-22';const queued=run(w,{action:'transfer_to_telesales',data:{ids:['c1'],owner:'m2',note:'Tư vấn dịch vụ'}});
    const called=run(queued,{action:'log_telesales_call',id:'c1',data:{outcome,note:'Đã trao đổi qua điện thoại',nextAction:'Cập nhật hồ sơ',at:'fake',actor:'fake',telesalesAttempts:999}});const c=called.customers[0];assert.equal(c.telesalesStatus,status);assert.equal(c.telesalesAttempts,1);assert.equal(c.telesalesLastCallAt,now);assert.equal(c.lastContactAt,now);assert.equal(c.telesalesLastOutcome,outcome);assert.equal(c.owner,'m1');assert.equal(c.telesalesOwner,'m2');assert.equal(c.interactions?.[0].actor,'Quản trị');assert.equal(c.interactions?.[0].at,now);assert.equal(c.interactions?.[0].channel,'Điện thoại');
    if(['Không phù hợp','Sai số'].includes(outcome))assert.equal(c.nextFollowUp,'');else assert.equal(c.nextFollowUp,'2026-11-22');
    assert.equal(c.status,outcome==='Không phù hợp'?'Không phù hợp':'Đang liên hệ');assert.equal(called.activities[0].kind,'log_telesales_call');
  }
});
test('assigned telesales employee cannot be deleted even without account ownership',()=>{
  const w=fixture();w.customers[0].phone='0912345678';const queued=run(w,{action:'transfer_to_telesales',data:{ids:['c1'],owner:'m2',note:'Phân công gọi'}});
  assert.throws(()=>run(queued,{action:'delete',collection:'team',id:'m2'}),/đang được sử dụng/);
});

test('rich customer profile normalizes contacts, tags and relationships without changing company/contact meaning',()=>{
  const w=fixture();w.customers.push({...w.customers[0],id:'c2',name:'Công ty liên quan',email:'related@example.test',phone:'+12025550190'});
  const next=run(w,{action:'update',collection:'customers',id:'c1',data:{jobTitle:' Giám đốc ',address:' Hà Nội ',website:'https://example.com',background:'Hồ sơ nền',avatarUrl:'/api/uploads/12345678-1234-1234-1234-123456789abc/avatar.png',favorite:true,tags:[' VIP ','VIP','Thân thiết',''],additionalPhones:[{label:' Văn phòng ',value:'0912 345 678'}],additionalEmails:[{label:' Công việc ',value:' EXTRA@EXAMPLE.TEST '}],socialLinks:[{label:' Facebook ',url:'https://example.com/social'}],relationships:[{customerId:'c2',label:' Đối tác '}],notesLog:[{id:'forged'}],actions:[{id:'forged'}]}});
  const c=next.customers[0];assert.equal(c.name,'Khách mẫu');assert.equal(c.contact,'An');assert.equal(c.jobTitle,'Giám đốc');assert.deepEqual(c.tags,['VIP','Thân thiết']);assert.equal(c.additionalPhones?.[0].value,'+84912345678');assert.equal(c.additionalEmails?.[0].value,'extra@example.test');assert.equal(c.relationships?.[0].label,'Đối tác');assert.deepEqual(c.notesLog,[]);assert.deepEqual(c.actions,[]);assert.equal(c.favorite,true);
});
test('profile lists, unsafe URLs and invalid/self/duplicate relationships reject',()=>{
  const w=fixture();w.customers.push({...w.customers[0],id:'c2',name:'Khác',email:'another@example.test'});
  const invalid=[{tags:Array(21).fill('tag')},{additionalPhones:Array(11).fill({label:'Khác',value:'0912345678'})},{additionalEmails:[{label:'Công việc',value:'bad'}]},{socialLinks:[{label:'Link',url:'javascript:alert(1)'}]},{website:'data:text/html,test'},{avatarUrl:'javascript:alert(1)'},{relationships:[{customerId:'c1',label:'Chính mình'}]},{relationships:[{customerId:'missing',label:'Không có'}]},{relationships:[{customerId:'c2',label:'Đối tác'},{customerId:'c2',label:' đối tác '}]}];
  for(const data of invalid)assert.throws(()=>run(w,{action:'update',collection:'customers',id:'c1',data}),CRMError);
});
test('duplicate contact prevention checks primary and additional values without collateral legacy errors',()=>{
  const w=fixture();w.customers[0].phone='0912345678';w.customers[0].additionalPhones=[{label:'Cơ quan',value:'0987654321'}];w.customers[0].additionalEmails=[{label:'Phụ',value:'extra@example.test'}];
  assert.throws(()=>run(w,{action:'create',collection:'customers',data:{name:'Trùng phụ',owner:'m1',email:'extra@EXAMPLE.TEST'}}),/Email này/);
  assert.throws(()=>run(w,{action:'create',collection:'customers',data:{name:'Trùng phụ',owner:'m1',phone:'+84987654321'}}),/Số điện thoại này/);
  assert.throws(()=>run(w,{action:'create',collection:'customers',data:{name:'Phụ trùng chính',owner:'m1',additionalPhones:[{label:'Khác',value:'+84912345678'}]}}),/Số điện thoại này/);
  assert.throws(()=>run(w,{action:'create',collection:'customers',data:{name:'Phụ trùng chính',owner:'m1',additionalEmails:[{label:'Khác',value:'AN@EXAMPLE.TEST'}]}}),/Email này/);
  w.customers.push({...w.customers[0],id:'c2',name:'Bản cũ trùng'});
  const next=run(w,{action:'update',collection:'customers',id:'c2',data:{jobTitle:'Giám đốc',additionalPhones:[{label:'Văn phòng mới',value:'+84987654321'}]}});assert.equal(next.customers[1].jobTitle,'Giám đốc');assert.equal(next.customers[1].additionalPhones?.[0].label,'Văn phòng mới');
});
test('customer relationship references block deleting the related customer',()=>{
  const w=fixture();w.customers.push({...w.customers[0],id:'c2',name:'Đối tác',email:'other@example.test'});
  const linked=run(w,{action:'update',collection:'customers',id:'c1',data:{relationships:[{customerId:'c2',label:'Đối tác'}]}});assert.throws(()=>run(linked,{action:'delete',collection:'customers',id:'c2'}),/đang được sử dụng/);
  const unlinked=run(linked,{action:'update',collection:'customers',id:'c1',data:{relationships:[]}});const deleted=run(unlinked,{action:'delete',collection:'customers',id:'c2'});assert.equal(deleted.customers.length,1);
});
test('customer notes use server author/time and editing retains original body in audit',()=>{
  const w=fixture();w.customers[0].notes='Nhu cầu gốc';const added=run(w,{action:'add_customer_note',id:'c1',data:{body:'Ghi chú lần đầu',createdAt:'fake',actor:'fake'}});const note=added.customers[0].notesLog![0];assert.equal(note.actor,'Quản trị');assert.equal(note.createdAt,now);assert.equal(added.customers[0].notes,'Nhu cầu gốc');
  const changed=applyCommand(added,{action:'update_customer_note',id:'c1',data:{noteId:note.id,body:'Nội dung cập nhật'},expectedRevision:0},'Người cập nhật','2026-11-18T08:00:00Z');const edited=changed.customers[0].notesLog![0];assert.equal(edited.actor,'Quản trị');assert.equal(edited.createdAt,now);assert.equal(edited.updatedAt,'2026-11-18T08:00:00Z');assert.deepEqual(changed.activities[0].details?.body,{before:'Ghi chú lần đầu',after:'Nội dung cập nhật'});assert.equal(changed.activities[0].actor,'Người cập nhật');
  assert.throws(()=>run(w,{action:'add_customer_note',id:'c1',data:{body:' '}}),/Nội dung ghi chú/);assert.throws(()=>run(added,{action:'update_customer_note',id:'c1',data:{noteId:'missing',body:'Khác'}}),/không tồn tại/);
});
test('customer task/call/meeting actions are server-owned and do not overwrite shared followup',()=>{
  const w=fixture();w.customers[0].nextFollowUp='2026-12-01';w.customers[0].nextAction='Gửi hồ sơ';
  for(const type of ['Công việc','Cuộc gọi','Cuộc hẹn']){
    const next=run(w,{action:'upsert_customer_action',id:'c1',data:{title:'Việc tiếp theo',type,dueDate:'2026-11-20',time:'14:30',owner:'m2',notes:'Nội dung thực hiện',status:'Hoàn tất',createdAt:'fake'}});const action=next.customers[0].actions![0];assert.equal(action.type,type);assert.equal(action.status,'Cần làm');assert.equal(action.createdAt,now);assert.equal(action.owner,'m2');assert.equal(action.time,'14:30');assert.equal(next.customers[0].nextFollowUp,'2026-12-01');assert.equal(next.customers[0].nextAction,'Gửi hồ sơ');
    const edited=run(next,{action:'upsert_customer_action',id:'c1',data:{actionId:action.id,title:'Tên mới',type,dueDate:'2026-11-21',time:'',owner:'m1',notes:'Cập nhật'}});assert.equal(edited.customers[0].actions!.length,1);assert.equal(edited.customers[0].actions![0].createdAt,now);assert.equal(edited.customers[0].actions![0].title,'Tên mới');
  }
  for(const data of [{title:'X',type:'Sai',dueDate:'2026-11-20',owner:'m1'},{title:'X',type:'Cuộc hẹn',dueDate:'2026-02-31',owner:'m1'},{title:'X',type:'Cuộc hẹn',dueDate:'2026-11-20',time:'24:61',owner:'m1'},{title:'X',type:'Cuộc hẹn',dueDate:'2026-11-20',owner:'missing'}])assert.throws(()=>run(w,{action:'upsert_customer_action',id:'c1',data}),CRMError);
});
test('completed and cancelled customer actions are immutable and require results/reasons',()=>{
  for(const completed of [true,false]){
    const created=run(fixture(),{action:'upsert_customer_action',id:'c1',data:{title:'Gọi khách',type:'Cuộc gọi',dueDate:'2026-11-20',owner:'m2',notes:''}});const id=created.customers[0].actions![0].id;
    const action=completed?'complete_customer_action':'cancel_customer_action';assert.throws(()=>run(created,{action,id:'c1',data:{actionId:id}}),CRMError);
    const done=run(created,{action,id:'c1',data:{actionId:id,...(completed?{result:'Khách hẹn gặp'}:{reason:'Khách đổi lịch'})}});assert.equal(done.customers[0].actions![0].status,completed?'Hoàn tất':'Đã hủy');assert.equal(done.customers[0].actions![0].result,completed?'Khách hẹn gặp':'Khách đổi lịch');assert.equal(done.customers[0].actions![0].completedAt,completed?now:undefined);
    assert.throws(()=>run(done,{action:'upsert_customer_action',id:'c1',data:{actionId:id,title:'Đổi',type:'Công việc',dueDate:'2026-11-20',owner:'m1',notes:''}}),/không thể chỉnh sửa/);
    assert.throws(()=>run(done,{action:'complete_customer_action',id:'c1',data:{actionId:id,result:'Lặp'}}),/không thể thay đổi/);assert.throws(()=>run(done,{action:'cancel_customer_action',id:'c1',data:{actionId:id,reason:'Lặp'}}),/không thể thay đổi/);
  }
});
test('customer action assignment protects referenced staff from deletion',()=>{
  const next=run(fixture(),{action:'upsert_customer_action',id:'c1',data:{title:'Cuộc hẹn',type:'Cuộc hẹn',dueDate:'2026-11-20',owner:'m2',notes:''}});assert.throws(()=>run(next,{action:'delete',collection:'team',id:'m2'}),/đang được sử dụng/);
});
test('deal metadata is server-owned, probabilities follow stages, and history records changes only',()=>{
  const w=fixture();const created=run(w,{action:'create',collection:'deals',data:{name:'Cơ hội mới',customerId:'c1',serviceId:'s1',owner:'m1',closeDate:'2026-11-20',value:5000000,stage:'Đang tư vấn',description:'Mô tả nhu cầu',createdAt:'fake',createdBy:'fake',stageHistory:[{stage:'fake'}]}});const deal=created.deals.at(-1)!;assert.equal(deal.probability,30);assert.equal(deal.createdAt,now);assert.equal(deal.createdBy,'Quản trị');assert.deepEqual(deal.stageHistory,[{stage:'Đang tư vấn',at:now,actor:'Quản trị'}]);
  const moved=run(created,{action:'update',collection:'deals',id:deal.id,data:{stage:'Đã gửi báo giá'}});const current=moved.deals.at(-1)!;assert.equal(current.probability,60);assert.equal(current.stageHistory?.length,2);assert.equal(current.stageChangedAt,now);
  const custom=run(moved,{action:'update',collection:'deals',id:deal.id,data:{stage:'Đang thương lượng',probability:72}});assert.equal(custom.deals.at(-1)!.probability,72);assert.equal(custom.deals.at(-1)!.stageHistory?.length,3);
  const unchanged=run(custom,{action:'update',collection:'deals',id:deal.id,data:{description:'Thêm mô tả'}});assert.equal(unchanged.deals.at(-1)!.stageHistory?.length,3);
  const lost=run(custom,{action:'update',collection:'deals',id:deal.id,data:{stage:'Không thành công',probability:95}});assert.equal(lost.deals.at(-1)!.probability,0);
  const won=run(custom,{action:'win_deal',id:deal.id});assert.equal(won.deals.at(-1)!.probability,100);assert.equal(won.deals.at(-1)!.stageHistory?.at(-1)?.stage,'Đã chốt');assert.equal(won.projects.length,w.projects.length+1);
  for(const probability of [-1,101,Number.NaN])assert.throws(()=>run(created,{action:'update',collection:'deals',id:deal.id,data:{probability}}),/Xác suất/);
});
test('normalizing old customer/deal records adds arrays but fabricates no historical dates',()=>{
  const w=fixture();const next=normalizeWorkspace(w);assert.deepEqual(next.customers[0].notesLog,[]);assert.deepEqual(next.customers[0].actions,[]);assert.deepEqual(next.customers[0].additionalPhones,[]);assert.deepEqual(next.customers[0].relationships,[]);assert.equal(next.customers[0].createdAt,undefined);assert.equal(next.deals[0].probability,60);assert.equal(next.deals[0].createdAt,undefined);assert.equal(next.deals[0].createdBy,undefined);assert.equal(next.deals[0].stageChangedAt,undefined);assert.deepEqual(next.deals[0].stageHistory,[]);
});

test('Excel preview normalizes phones and distinguishes CRM/file duplicates without mutating records',()=>{
  const w=fixture();w.customers[0].phone='0912 345 678';w.customers[0].additionalPhones=[{label:'Văn phòng',value:'0987654321'}];w.customers[0].additionalEmails=[{label:'Phụ',value:'secondary@example.test'}];
  const before=structuredClone(w);
  const input=[
    {rowNumber:2,data:{name:'Trùng chính',phone:'+84912345678'}},
    {rowNumber:3,data:{name:'Trùng số phụ',phone:'0084 987 654 321'}},
    {rowNumber:4,data:{name:'Mới hợp lệ',phone:'0901 234 567',email:' NEW@EXAMPLE.TEST ',tags:'VIP; Giới thiệu'}},
    {rowNumber:5,data:{name:'Trùng trong file',phone:'84901234567'}},
    {rowNumber:6,data:{name:'Trùng email phụ',phone:'0902222333',email:'SECONDARY@example.test'}},
    {rowNumber:7,data:{name:'Thiếu điện thoại',phone:''}},
    {rowNumber:8,data:{name:'Sai email',phone:'0903333444',email:'bad'}},
    {rowNumber:9,data:{name:'Hợp lệ sau dòng lỗi',phone:'0903333444'}},
  ];
  const preview=previewCustomerImport(input,w,'m1');
  assert.deepEqual(preview.map(row=>row.status),['duplicate','duplicate','ready','duplicate','duplicate','invalid','invalid','ready']);
  assert.match(preview[0].message,/CRM: Khách mẫu/);assert.match(preview[3].message,/dòng 4 trong file/);
  assert.equal(preview[2].customer.phone,'+84901234567');assert.equal(preview[2].customer.email,'new@example.test');assert.deepEqual(preview[2].customer.tags,['VIP','Giới thiệu']);assert.deepEqual(w,before);
});
test('Excel import is atomic and refuses duplicate, invalid, oversized or ownerless batches',()=>{
  const w=fixture(),base={owner:'m1',sourceFile:'khach-hang.xlsx'};
  const good={name:'Khách mới',phone:'0901111222'};
  const badRows=[
    [good,{name:'Trùng',phone:'+84901111222'}],
    [good,{name:'Sai số',phone:'không có'}],
    [good,{name:'',phone:'0902222333'}],
    [good,{name:'Email trùng CRM',phone:'0902222333',email:'AN@example.test'}],
    [good,{name:'Website không an toàn',phone:'0902222333',website:'javascript:alert(1)'}],
  ];
  const before=structuredClone(w);
  for(const rows of badRows)assert.throws(()=>run(w,{action:'import_customers',data:{...base,rows}}),CRMError);
  assert.throws(()=>run(w,{action:'import_customers',data:{...base,rows:[]}}),/1 đến 500/);
  assert.throws(()=>run(w,{action:'import_customers',data:{...base,rows:Array(501).fill(good)}}),/500/);
  assert.throws(()=>run(w,{action:'import_customers',data:{...base,owner:'missing',rows:[good]}}),/nhân sự/);
  assert.throws(()=>run(w,{action:'import_customers',data:{...base,rows:[{...good,name:'x'.repeat(301)}]}}),/300/);
  assert.deepEqual(w,before);
});
test('Excel import creates server-owned identities/audits and preserves existing customers',()=>{
  const w=fixture(),before=structuredClone(w.customers[0]);
  const next=run(w,{action:'import_customers',data:{owner:'m1',sourceFile:'data.xlsx',rows:[{id:'c1',name:'Khách mới',phone:'0901 234 567',owner:'m2',email:' NEW@EXAMPLE.TEST ',createdAt:'fake',updatedAt:'fake',telesalesOwner:'m2',telesalesStatus:'Đủ điều kiện',notesLog:[{id:'fake'}],status:'',priority:''},{name:'Khách thứ hai',phone:'0902222333',notes:'Nhu cầu website'}]}});
  assert.equal(next.customers.length,3);assert.equal(next.customers[0].name,before.name);assert.equal(next.customers[0].owner,before.owner);
  const created=next.customers[1];assert.notEqual(created.id,'c1');assert.equal(created.owner,'m1');assert.equal(created.phone,'+84901234567');assert.equal(created.email,'new@example.test');assert.equal(created.createdAt,now);assert.equal(created.updatedAt,now);assert.equal(created.telesalesOwner,'');assert.equal(created.telesalesStatus,'Chưa chuyển');assert.deepEqual(created.notesLog,[]);assert.equal(created.status,'Mới');assert.equal(created.priority,'Trung bình');
  assert.equal(next.activities.length,2);assert.ok(next.activities.every(event=>event.kind==='import_customers' && event.actor==='Quản trị' && event.time===now && event.text.includes('data.xlsx')));assert.equal(w.customers.length,1);
  assert.throws(()=>run(next,{action:'import_customers',data:{owner:'m1',sourceFile:'data.xlsx',rows:[{name:'Nhập lại',phone:'0901234567'}]}}),/Trùng số điện thoại/);
});
test('bulk telesales distribution validates the complete plan before applying any assignment',()=>{
  const w=fixture();w.customers[0].phone='0901111222';w.customers.push({...w.customers[0],id:'c2',name:'Khách 2',phone:'0902222333'});const before=structuredClone(w);
  const base={note:'Chia khách mới',nextFollowUp:'2026-11-20',allowReassign:false};
  for(const assignments of [
    [{owner:'m1',ids:['c1']},{owner:'m2',ids:['c1']}],
    [{owner:'m1',ids:['c1']},{owner:'m1',ids:['c2']}],
    [{owner:'m1',ids:['c1']},{owner:'missing',ids:['c2']}],
    [{owner:'m1',ids:['c1']},{owner:'m2',ids:['missing']}],
    [{owner:'m1',ids:['c1','c1']}],
    [{owner:'m1',ids:[]}],
  ])assert.throws(()=>run(w,{action:'distribute_customers',data:{...base,assignments}}),CRMError);
  assert.throws(()=>run(w,{action:'distribute_customers',data:{...base,nextFollowUp:'2026-02-31',assignments:[{owner:'m1',ids:['c1']}]}}),/Ngày cần gọi/);
  assert.throws(()=>run(w,{action:'distribute_customers',data:{...base,note:'',assignments:[{owner:'m1',ids:['c1']}]}}),/Ghi chú chia khách/);
  assert.deepEqual(w,before);
  w.customers[1].phone='';assert.throws(()=>run(w,{action:'distribute_customers',data:{...base,assignments:[{owner:'m1',ids:['c1']},{owner:'m2',ids:['c2']}]}}),/Khách 2 chưa có số điện thoại/);assert.equal(w.customers[0].telesalesOwner,undefined);
});
test('bulk telesales distribution applies explicit quotas, retains account/history and audits every recipient',()=>{
  const w=fixture();w.customers[0].phone='0901111222';w.customers.push({...w.customers[0],id:'c2',name:'Khách 2',phone:'0902222333'},{...w.customers[0],id:'c3',name:'Khách 3',phone:'0903333444'});
  w.customers[0].telesalesOwner='m2';w.customers[0].telesalesAttempts=4;w.customers[0].telesalesLastCallAt='2026-11-15T00:00:00Z';w.customers[0].interactions=[{id:'call',at:'2026-11-15T00:00:00Z',channel:'Điện thoại',outcome:'Quan tâm',note:'Trao đổi',actor:'An'}];
  const assignments=[{owner:'m1',ids:['c1','c3']},{owner:'m2',ids:['c2']}],base={assignments,note:'Chia theo ca trực',nextFollowUp:'2026-11-21'};
  assert.throws(()=>run(w,{action:'distribute_customers',data:{...base,allowReassign:false}}),/đã có telesales/);
  const next=run(w,{action:'distribute_customers',data:{...base,allowReassign:true}});
  assert.deepEqual(next.customers.map(customer=>customer.telesalesOwner),['m1','m2','m1']);assert.ok(next.customers.every(customer=>customer.owner==='m1' && customer.telesalesStatus==='Chờ gọi' && customer.nextFollowUp==='2026-11-21' && customer.telesalesQueuedAt===now));assert.equal(next.customers[0].telesalesAttempts,4);assert.equal(next.customers[0].telesalesLastCallAt,'2026-11-15T00:00:00Z');assert.deepEqual(next.customers[0].interactions,w.customers[0].interactions);assert.equal(next.activities.length,3);assert.ok(next.activities.every(event=>event.kind==='distribute_customers' && event.details?.telesalesOwner && event.entityId));
});
test('bulk telesales distribution enforces a global 500-customer limit across recipients',()=>{
  const w=fixture();w.customers=Array.from({length:501},(_,index)=>({...w.customers[0],id:`bulk-${index}`,name:`Khách ${index}`,phone:`+849${String(index).padStart(8,'0')}`}));
  assert.throws(()=>run(w,{action:'distribute_customers',data:{assignments:[{owner:'m1',ids:w.customers.slice(0,250).map(customer=>customer.id)},{owner:'m2',ids:w.customers.slice(250).map(customer=>customer.id)}],note:'Chia danh sách',nextFollowUp:'2026-11-20',allowReassign:false}}),/tối đa 500/);assert.ok(w.customers.every(customer=>!customer.telesalesOwner));
});
