import type { AccessContext, AccessViewer, Activity, Collection, Command, Customer, CustomerAction, CustomerNote, CustomerInteraction, Project, Workspace } from './crm-types.js';
import { CONTENT_STATUSES, CUSTOMER_STATUSES, CONTACT_CHANNELS, CALL_OUTCOMES, DEAL_PROBABILITIES, PROJECT_STATUSES, QUOTE_STAGES, STAGES, TASK_STATUSES } from './crm-types.js';
import { canWriteCollections, collected, documentKey, isCollectionAction } from './project-collections.js';
import { CRMError } from './crm-error.js';
import { applySalesCommand, isSalesAction } from './sales-workflow.js';
import { isSalesHandoffAction } from './sales-handoff.js';
import { applyFinanceCommand } from './finance-workflow.js';
import { hasPublicationApproval, projectOpenWork } from './project-progress.js';
import type { Content } from './crm-types.js';
export { CRMError } from './crm-error.js';
const collections: Collection[] = ['customers', 'services', 'deals', 'projects', 'tasks', 'contents', 'issues', 'assets', 'team'];
const own = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new CRMError(message); }
function text(v: unknown, label: string, required = true) { check(typeof v === 'string' && v.length <= 30000 && (!required || v.trim().length > 0), `${label} không hợp lệ.`); }
function number(v: unknown, label: string, max = 1e12) { check(typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max, `${label} phải là số không âm hợp lệ.`); }
function date(v: unknown, label: string, required = true) { if ((v===undefined || v==='') && !required) return; check(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(new Date(v).getTime()) && new Date(v).toISOString().slice(0, 10) === v, `${label} không hợp lệ.`); }
function url(v: unknown) { if (!v) return; text(v, 'Đường dẫn'); if (/^\/api\/uploads\/[a-f0-9-]{36}\//.test(v as string)) return; try { check(['http:', 'https:'].includes(new URL(v as string).protocol), 'Chỉ chấp nhận đường dẫn http/https.'); } catch { throw new CRMError('Đường dẫn không hợp lệ.'); } }
function webUrl(v: unknown) { if(v===undefined || v==='')return;text(v,'Đường dẫn');try{check(['http:','https:'].includes(new URL(v as string).protocol),'Chỉ chấp nhận đường dẫn http/https.');}catch{throw new CRMError('Đường dẫn website/mạng xã hội không hợp lệ.');} }
function email(v: unknown) { if (!v) return; check(typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email không hợp lệ.'); }
function oneOf(v: unknown, values: string[], label: string) { check(typeof v === 'string' && values.includes(v), `${label} không hợp lệ.`); }
export function businessDate(now = new Date().toISOString()) { const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)); const part=(name:string)=>parts.find(p=>p.type===name)!.value; return `${part('year')}-${part('month')}-${part('day')}`; }
function find<T extends { id: string }>(rows: T[], id: unknown, label: string): T { const row = rows.find(r => r.id === id); check(row, `${label} không tồn tại.`); return row; }
function owner(w: Workspace, name: unknown) { text(name, 'Người phụ trách'); check(w.team.some(p => p.name === name || p.id === name), 'Người phụ trách chưa có trong danh sách nhân sự.'); }
function project(w: Workspace, id: unknown, writable = false) { const p = find(w.projects, id, 'Dự án'); if (writable) check(p.status !== 'Hoàn tất', 'Dự án đã hoàn tất.'); return p; }
function ownerName(w:Workspace,value:string) {return w.team.find(member=>member.id===value || member.name===value)?.name || value;}
function ownerId(w:Workspace,value:unknown) {owner(w,value);return (w.team.find(member=>member.id===value) || w.team.find(member=>member.name===value))!.id;}

/** Compatibility projection only: archived change requests and approval metadata survive. */
export function normalizeWorkspace(current:Workspace):Workspace {
  const w=structuredClone(current);
  const contentStates:Record<string,string>={'Chờ duyệt':'Đang sản xuất','Cần chỉnh sửa':'Đang sản xuất','Đã duyệt':'Sẵn sàng đăng'};
  const customerStates:Record<string,string>={'Tiềm năng':'Mới','Đang chăm sóc':'Đang liên hệ','Đã hoàn tất':'Tạm ngừng'};
  for(const content of w.contents) content.status=contentStates[content.status] || content.status;
  for(const customer of w.customers) {
    customer.status=customerStates[customer.status] || customer.status;
    customer.source??='';customer.priority??='Trung bình';customer.nextFollowUp??='';customer.nextAction??='';customer.telegram??='';customer.interactions??=[];
    customer.telesalesOwner??='';customer.telesalesStatus??=customer.telesalesOwner?'Chờ gọi':'Chưa chuyển';customer.telesalesAttempts??=0;customer.telesalesHandoffNote??='';
    customer.jobTitle??='';customer.address??='';customer.website??='';customer.background??='';customer.avatarUrl??='';customer.favorite??=false;customer.tags??=[];customer.additionalPhones??=[];customer.additionalEmails??=[];customer.socialLinks??=[];customer.relationships??=[];customer.notesLog??=[];customer.actions??=[];
  }
  for(const deal of w.deals){deal.probability??=DEAL_PROBABILITIES[deal.stage]??10;if(deal.stage==='Đã chốt')deal.probability=100;if(deal.stage==='Không thành công')deal.probability=0;deal.description??='';deal.stageHistory??=[];}
  w.changes??=[];
  return w;
}
export function normalizePhone(value:unknown):string {
  if(value===undefined || value==='')return '';
  text(value,'Số điện thoại');
  check(/^[+\d\s().-]+$/.test(String(value)),'Số điện thoại chỉ gồm chữ số và ký hiệu +, khoảng trắng, dấu ngoặc hoặc gạch nối.');
  let result=String(value).replace(/[\s().-]/g,'');
  if(result.startsWith('00'))result='+'+result.slice(2);
  check(/^\+?\d{7,15}$/.test(result),'Số điện thoại phải có từ 7 đến 15 chữ số.');
  if(result.startsWith('0'))result='+84'+result.slice(1);
  else if(result.startsWith('84') && result.length>=10)result='+'+result;
  return result;
}
export function normalizeTelegram(value:unknown):string {
  if(value===undefined || value==='')return '';
  text(value,'Telegram');let name=String(value).trim();
  if(/^https?:\/\//i.test(name)) {
    try{const parsed=new URL(name);check(parsed.hostname==='t.me' && !parsed.search && !parsed.hash,'Dùng tên tài khoản hoặc đường dẫn https://t.me/username.');name=parsed.pathname.replace(/^\//,'').replace(/\/$/,'');}catch{throw new CRMError('Telegram không hợp lệ. Dùng @username hoặc https://t.me/username.');}
  }else name=name.replace(/^t\.me\//i,'').replace(/^@/,'').replace(/\/$/,'');
  check(/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name),'Telegram cần tên tài khoản 5–32 ký tự, bắt đầu bằng chữ cái.');
  return name.toLowerCase();
}
function normalizeCustomerInput(w:Workspace,r:Row) {
  text(r.email,'Email',false);
  r.email=str(r.email).toLowerCase();r.phone=normalizePhone(r.phone);r.telegram=normalizeTelegram(r.telegram);r.owner=ownerId(w,r.owner);
  const listLabels:Record<string,string>={tags:'Nhãn',additionalPhones:'Số điện thoại bổ sung',additionalEmails:'Email bổ sung',socialLinks:'Liên kết mạng xã hội',relationships:'Quan hệ khách hàng'};
  const array=(key:string,max:number):unknown[]=>{check(Array.isArray(r[key]) && r[key].length<=max,`${listLabels[key] || key} cần là danh sách tối đa ${max} mục.`);return r[key] as unknown[];};
  const object=(value:unknown):Record<string,unknown>=>{check(!!value && typeof value==='object' && !Array.isArray(value),'Thông tin hồ sơ không hợp lệ.');return value as Record<string,unknown>;};
  const seenTags=new Set<string>();r.tags=array('tags',20).map(value=>{text(value,'Nhãn',false);check(String(value).length<=80,'Mỗi nhãn tối đa 80 ký tự.');return str(value);}).filter(value=>{if(!value || seenTags.has(value.toLowerCase()))return false;seenTags.add(value.toLowerCase());return true;});
  r.additionalPhones=array('additionalPhones',10).map(value=>{const item=object(value);text(item.label,'Nhãn số điện thoại',false);check(str(item.label).length<=80,'Nhãn số điện thoại tối đa 80 ký tự.');const phone=normalizePhone(item.value);check(phone,'Số điện thoại bổ sung không được để trống.');return{label:str(item.label),value:phone};});
  r.additionalEmails=array('additionalEmails',10).map(value=>{const item=object(value);text(item.label,'Nhãn email',false);check(str(item.label).length<=80,'Nhãn email tối đa 80 ký tự.');text(item.value,'Email bổ sung');email(str(item.value));return{label:str(item.label),value:str(item.value).toLowerCase()};});
  r.socialLinks=array('socialLinks',10).map(value=>{const item=object(value);text(item.label,'Tên mạng xã hội');check(str(item.label).length<=80,'Tên mạng xã hội tối đa 80 ký tự.');text(item.url,'Đường dẫn mạng xã hội');webUrl(str(item.url));return{label:str(item.label),url:str(item.url)};});
  const relationshipKeys=new Set<string>();r.relationships=array('relationships',20).map(value=>{const item=object(value);text(item.customerId,'Khách hàng liên quan');text(item.label,'Quan hệ');check(str(item.label).length<=100,'Quan hệ tối đa 100 ký tự.');check(item.customerId!==r.id,'Khách hàng không thể liên kết với chính mình.');find(w.customers,item.customerId,'Khách hàng liên quan');const key=`${item.customerId}\u0000${str(item.label).toLowerCase()}`;check(!relationshipKeys.has(key),'Quan hệ khách hàng bị trùng.');relationshipKeys.add(key);return{customerId:str(item.customerId),label:str(item.label)};});
  for(const key of ['jobTitle','address','website','background','avatarUrl']){text(r[key],key,false);r[key]=str(r[key]);}
  webUrl(r.website);url(r.avatarUrl);check(typeof r.favorite==='boolean','Đánh dấu yêu thích không hợp lệ.');
}
function safePhone(value:unknown) {try{return normalizePhone(value);}catch{return '';}}
function contactValues(r:Row,key:'phone'|'email'):Set<string>{
  const values=[r[key]];const extras=r[key==='phone'?'additionalPhones':'additionalEmails'];if(Array.isArray(extras))for(const item of extras)if(item && typeof item==='object' && 'value' in item)values.push(item.value);
  return new Set(values.map(value=>key==='phone'?safePhone(value):str(value).toLowerCase()).filter(Boolean));
}
function checkCustomerDuplicates(w:Workspace,r:Row,before?:Row) {
  for(const key of ['email','phone'] as const){
    const previous=before?contactValues(before,key):new Set<string>();
    for(const value of contactValues(r,key))if(!previous.has(value))check(!w.customers.some(c=>c.id!==r.id && contactValues(c as unknown as Row,key).has(value)),key==='email'?'Email này đã được dùng cho khách hàng khác.':'Số điện thoại này đã được dùng cho khách hàng khác.');
  }
}
function diff(before:Row,after:Row,keys:string[]):Activity['details'] {
  const changes:NonNullable<Activity['details']>={};for(const key of keys)if(JSON.stringify(before[key])!==JSON.stringify(after[key]))changes[key]={before:before[key]??null,after:after[key]??null};return changes;
}
const fields: Record<Collection, string[]> = {
  customers: ['name','industry','contact','email','phone','owner','status','notes','color','source','priority','nextFollowUp','nextAction','telegram','jobTitle','address','website','background','avatarUrl','favorite','tags','additionalPhones','additionalEmails','socialLinks','relationships'],
  services: ['name','category','price','unit','duration','deliverables','exclusions','revisions','active'],
  deals: ['name','customerId','serviceId','value','stage','owner','closeDate','nextAction','scope','probability','description','lossReason'],
  projects: ['name','customerId','serviceId','owner','status','startDate','dueDate','budget','cost','scope','exclusions','revisions','acceptance'],
  tasks: ['projectId','name','owner','status','dueDate','hours','hourlyCost','notes','deliveryResult'],
  contents: ['projectId','title','channel','batch','publishDate','status','owner','body','feedback','url'],
  changes: ['projectId','title','reason','fee','extraDays','status','customerConfirmed','confirmation'],
  issues: ['projectId','title','description','owner','priority','status','dueDate'],
  assets: ['name','category','industry','serviceId','description','url','shareable','watermark'],
  team: ['name','role','email','color'],
};
type Row = Record<string, unknown> & { id: string };
function rows(w: Workspace, c: Collection): Row[] { return w[c] as unknown as Row[]; }
function pick(c: Collection, data: Record<string, unknown>) { const clean: Record<string, unknown> = {}; for (const key of fields[c]) if (own(data, key)) clean[key] = data[key]; return clean; }
function validate(w: Workspace, c: Collection, r: Row) {
  for (const value of Object.values(r)) if (typeof value === 'string') check(value.length <= 30000, 'Nội dung vượt quá giới hạn.');
  const numericFields=new Set(['price','duration','revisions','value','budget','cost','hours','hourlyCost','fee','extraDays','probability']);
  const booleanFields=new Set(['active','customerConfirmed','shareable','watermark','favorite']);
  const arrayFields=new Set(['tags','additionalPhones','additionalEmails','socialLinks','relationships']);
  for (const key of fields[c]) if (own(r,key)) {
    if(arrayFields.has(key))check(Array.isArray(r[key]),`${key} không hợp lệ.`);
    else if (numericFields.has(key)) number(r[key],key);
    else if (booleanFields.has(key)) check(typeof r[key]==='boolean',`${key} không hợp lệ.`);
    else text(r[key],key,false);
  }
  if (['customers','services','deals','projects','tasks','assets','team'].includes(c)) text(r.name, 'Tên');
  if (['contents','issues'].includes(c)) text(r.title, 'Tiêu đề');
  if (['customers','deals','projects','tasks','contents','issues'].includes(c)) owner(w, r.owner);
  if (['customers','team'].includes(c)) email(r.email);
  if (c === 'customers') { oneOf(r.status,CUSTOMER_STATUSES,'Trạng thái khách hàng'); if(r.priority)oneOf(r.priority,['Cao','Trung bình','Thấp'],'Mức ưu tiên');date(r.nextFollowUp,'Ngày liên hệ tiếp',false);normalizePhone(r.phone);normalizeTelegram(r.telegram); }
  if (['deals','projects'].includes(c)) { find(w.customers, r.customerId, 'Khách hàng'); find(w.services, r.serviceId, 'Dịch vụ'); }
  if (['tasks','contents','issues'].includes(c)) project(w, r.projectId);
  if (c === 'services') { number(r.price, 'Đơn giá'); number(r.duration, 'Thời hạn', 3650); number(r.revisions, 'Số vòng sửa', 100); check(Number.isInteger(r.revisions), 'Số vòng sửa phải là số nguyên.'); text(r.deliverables, 'Đầu ra'); check(typeof r.active === 'boolean', 'Trạng thái dịch vụ không hợp lệ.'); }
  if (c === 'deals') { number(r.value, 'Giá trị');number(r.probability,'Xác suất',100);date(r.closeDate, 'Ngày dự kiến chốt'); oneOf(r.stage, STAGES, 'Giai đoạn'); }
  if (c === 'projects') { number(r.budget, 'Ngân sách'); number(r.cost, 'Chi phí'); number(r.revisions, 'Số vòng sửa', 100); date(r.startDate, 'Ngày bắt đầu'); date(r.dueDate, 'Deadline'); check(String(r.dueDate) >= String(r.startDate), 'Deadline phải sau ngày bắt đầu.'); oneOf(r.status, PROJECT_STATUSES, 'Trạng thái dự án'); text(r.scope, 'Phạm vi'); }
  if (c === 'tasks') { number(r.hours, 'Số giờ', 100000); number(r.hourlyCost, 'Chi phí giờ'); date(r.dueDate, 'Hạn công việc'); oneOf(r.status, TASK_STATUSES, 'Trạng thái công việc'); }
  if (c === 'contents') { number(r.version, 'Phiên bản', 100000); date(r.publishDate, 'Ngày đăng', false); oneOf(r.status, CONTENT_STATUSES, 'Trạng thái nội dung'); url(r.url); }
  if (c === 'issues') { date(r.dueDate, 'Hạn xử lý', false); oneOf(r.status, ['Mới','Đang mở','Chờ xử lý','Đang xử lý','Đã chuyển cấp','Đã xử lý','Đã giải quyết'], 'Trạng thái vướng mắc'); }
  if (c === 'assets') { if (r.serviceId) find(w.services, r.serviceId, 'Dịch vụ'); url(r.url); check(typeof r.shareable === 'boolean' && typeof r.watermark === 'boolean', 'Quyền chia sẻ không hợp lệ.'); }
  if (c === 'team') { check(!w.team.some(m => m.id !== r.id && m.name === r.name), 'Tên nhân sự đã tồn tại.'); text(r.role, 'Vai trò'); }
}
function defaults(c: Collection, now: string): Record<string, unknown> {
  const today=businessDate(now);
  const base: Record<Collection, Record<string, unknown>> = {
    customers: {industry:'',contact:'',email:'',phone:'',status:'Mới',notes:'',color:'#ff6b35',source:'',priority:'Trung bình',nextFollowUp:'',nextAction:'',telegram:'',createdAt:now,updatedAt:now,interactions:[],telesalesOwner:'',telesalesStatus:'Chưa chuyển',telesalesAttempts:0,telesalesHandoffNote:'',jobTitle:'',address:'',website:'',background:'',avatarUrl:'',favorite:false,tags:[],additionalPhones:[],additionalEmails:[],socialLinks:[],relationships:[],notesLog:[],actions:[]},
    services: {category:'Dịch vụ',price:0,unit:'gói',duration:30,deliverables:'',exclusions:'',revisions:2,active:true},
    deals: {value:0,stage:STAGES[0],closeDate:today,nextAction:'',scope:'',description:''},
    projects: {status:PROJECT_STATUSES[0],startDate:today,dueDate:today,budget:0,cost:0,scope:'',exclusions:'',revisions:2,acceptance:''},
    tasks: {status:TASK_STATUSES[0],dueDate:today,hours:0,hourlyCost:0,notes:''},
    contents: {channel:'Facebook',batch:'',publishDate:'',status:'Ý tưởng',version:1,body:'',feedback:'',url:''},
    changes: {reason:'',fee:0,extraDays:0,status:'Chờ duyệt',customerConfirmed:false,confirmation:'',createdAt:now},
    issues: {description:'',priority:'Bình thường',status:'Đang mở',dueDate:'',createdAt:now},
    assets: {category:'Case study',industry:'',serviceId:'',description:'',url:'',shareable:false,watermark:false},
    team: {role:'Nhân sự',email:'',color:'#ff6b35'},
  }; return base[c];
}
export interface CustomerImportPreviewRow { rowNumber:number;status:'ready'|'duplicate'|'invalid';message:string;customer:Record<string,unknown> }
export const prospectFields = new Set(['name','contact','phone','email','industry','source','priority','status','notes','nextAction','nextFollowUp']);
type ProspectViewer = Pick<AccessViewer,'role'|'memberId'>;
export function requireProspectMember(workspace:Workspace,viewer?:ProspectViewer):string {
  if (!viewer?.memberId || !['account','telesales'].includes(viewer.role) || !workspace.team.some(member=>member.id===viewer.memberId)) {
    throw new CRMError('Tài khoản không có quyền thêm khách tự khai thác.',403);
  }
  return viewer.memberId;
}
function assignProspect(row:Row,memberId:string,isTelesales:boolean,now:string) {
  row.owner=memberId;
  row.prospectedBy=memberId;
  if(isTelesales) {
    check(normalizePhone(row.phone),'Cần số điện thoại để thêm khách vào danh sách gọi.');
    row.telesalesOwner=memberId;
    row.telesalesStatus='Chờ gọi';
    row.telesalesQueuedAt=now;
  }
}
type ImportEntry = {rowNumber:number;data:Record<string,unknown>};
function validateProspectEntries(input:unknown):asserts input is ImportEntry[] {
  check(Array.isArray(input) && input.length>0 && input.length<=500,'Mỗi lần nhập từ 1 đến 500 khách hàng.');
  const rowNumbers=new Set<number>();
  for(const entry of input) {
    check(entry && typeof entry==='object' && !Array.isArray(entry) && Number.isInteger(entry.rowNumber)
      && entry.rowNumber>=1 && entry.rowNumber<=1048576 && !rowNumbers.has(entry.rowNumber),'Số dòng Excel không hợp lệ hoặc bị lặp.');
    rowNumbers.add(entry.rowNumber);
    check(entry.data && typeof entry.data==='object' && !Array.isArray(entry.data),'Dòng dữ liệu khách hàng không hợp lệ.');
    if(Object.keys(entry).some(key=>key!=='rowNumber' && key!=='data') || Object.keys(entry.data).some(key=>!prospectFields.has(key))) {
      throw new CRMError('Dòng Excel chứa trường ngoài phạm vi nhập khách tự khai thác.',403);
    }
  }
}
export function previewProspectImport(input:unknown,workspace:Workspace,viewer:ProspectViewer) {
  const memberId=requireProspectMember(workspace,viewer);
  validateProspectEntries(input);
  return previewCustomerImport(input,workspace,memberId,'anonymous').map(row=>({
    ...row,
    customer:Object.fromEntries(Object.entries(row.customer).filter(([field])=>prospectFields.has(field))),
  }));
}
const customerImportLimits:Record<string,number>={name:300,contact:200,phone:100,email:254,industry:200,source:200,notes:5000,address:500,website:1000,jobTitle:200,background:5000,status:80,priority:30,nextFollowUp:10,nextAction:1000};
function importCustomer(w:Workspace,input:unknown,defaultOwner:string,id:string,now:string):Row {
  check(!!input && typeof input==='object' && !Array.isArray(input),'Dòng dữ liệu khách hàng không hợp lệ.');
  const source=input as Record<string,unknown>,clean:Record<string,unknown>={};
  for(const [key,max] of Object.entries(customerImportLimits))if(own(source,key)){
    text(source[key],key,false);check(String(source[key]).length<=max,`${key} tối đa ${max} ký tự.`);
    const value=str(source[key]);if(value || !['status','priority'].includes(key))clean[key]=value;
  }
  for(const key of ['tags','additionalPhones','additionalEmails'])if(own(source,key))clean[key]=source[key];
  if(typeof clean.tags==='string')clean.tags=clean.tags.split(/[,;]/).map(tag=>tag.trim()).filter(Boolean);
  const row:Row={id,...defaults('customers',now),...clean,owner:defaultOwner,color:'#e92b22'};
  text(row.name,'Tên khách hàng');text(row.phone,'Số điện thoại');
  normalizeCustomerInput(w,row);validate(w,'customers',row);
  return row;
}
/** Pure preflight shared by the Excel preview and server. Only ready rows reserve contact keys. */
export function previewCustomerImport(input:ImportEntry[],workspace:Workspace,defaultOwner:string,existingContacts:'named'|'anonymous'='named'):CustomerImportPreviewRow[] {
  check(Array.isArray(input) && input.length<=500,'Mỗi lần nhập tối đa 500 khách hàng.');
  const phoneOwners=new Map<string,string>(),emailOwners=new Map<string,string>();
  for(const customer of workspace.customers){
    const label=existingContacts==='named'?`CRM: ${customer.name}`:'hồ sơ đã có trong CRM';
    for(const value of contactValues(customer as unknown as Row,'phone'))phoneOwners.set(value,label);
    for(const value of contactValues(customer as unknown as Row,'email'))emailOwners.set(value,label);
  }
  return input.map((entry,index)=>{
    const rowNumber=Number.isInteger(entry?.rowNumber)&&entry.rowNumber>0?entry.rowNumber:index+2;
    let customer:Record<string,unknown>={};
    try{
      const row=importCustomer(workspace,entry?.data,defaultOwner,`import-preview-${index}`,'2000-01-01T00:00:00.000Z');
      customer=pick('customers',row);
      for(const [key,owners,label] of [['phone',phoneOwners,'số điện thoại'],['email',emailOwners,'email']] as const){
        for(const value of contactValues(row,key)){const duplicate=owners.get(value);if(duplicate)return{rowNumber,status:'duplicate' as const,message:`Trùng ${label} với ${duplicate}.`,customer};}
      }
      for(const value of contactValues(row,'phone'))phoneOwners.set(value,`dòng ${rowNumber} trong file`);
      for(const value of contactValues(row,'email'))emailOwners.set(value,`dòng ${rowNumber} trong file`);
      return{rowNumber,status:'ready' as const,message:'Sẵn sàng nhập',customer};
    }catch(error){
      if(entry?.data && typeof entry.data==='object' && !Array.isArray(entry.data))customer=Object.fromEntries(Object.entries(entry.data).filter(([key,value])=>own(customerImportLimits,key)&&typeof value==='string'));
      return{rowNumber,status:'invalid' as const,message:error instanceof Error?error.message:'Dữ liệu không hợp lệ.',customer};
    }
  });
}

function recordLabel(row: Row) { return str(row.name) || str(row.title) || row.id; }
function log(w: Workspace, actor: string, now: string, textValue: string, kind: string, entityId?: string, details?:Activity['details']) {
  const activity: Activity = {id:crypto.randomUUID(), text:textValue,time:now,actor,kind,entityId,details}; w.activities.unshift(activity);
}

function applyCollection(w: Workspace, command: Command, actor: string, now: string, viewer: CommandViewer, live: boolean) {
  const p = project(w, command.id);
  const d = command.data || {};
  const today = businessDate(now);
  const action = command.action;
  const ledger = p.ledger;
  if (viewer.role === 'finance' && !p.contract) throw new CRMError('Hợp đồng chưa có trong sổ theo dõi của Tài chính.',403);
  if (action === 'void_project_receipt') check(!live,'Hãy gửi đề nghị xử lý phiếu để Chủ sở hữu xác nhận.');
  if (live && action !== 'confirm_legacy_contract') check(p.contract,'Xác nhận hợp đồng trước khi cập nhật sổ thu tiền.');
  if (action === 'confirm_legacy_contract' || action === 'request_receipt_correction' || action === 'review_receipt_correction' ||
    action === 'request_legacy_contract_change' || action === 'review_legacy_contract_change') {
    check(live && viewer.userId,'Chức năng đối chiếu sử dụng tài khoản trong dữ liệu công ty.');
    const before = p.budget;
    const message = applyFinanceCommand(w,p,command,{id:viewer.userId,name:actor,at:now},viewer.role,today);
    log(w,actor,now,`${message} · ${p.name}`,action,p.id,{
      budget:{before,after:p.budget}, reference:{before:null,after:d.correctionId ?? d.receiptId ?? d.changeId ?? p.contract?.number},
    });
    return;
  }
  if (action === 'open_project_ledger' || action === 'set_payment_due') {
    date(d.paymentDue, 'Hạn thanh toán', false);
  }
  if (action === 'open_project_ledger') {
    check(!ledger, 'Dự án đã mở sổ thu tiền.');
    check(Number.isSafeInteger(p.budget) && p.budget > 0, 'Cần nhập giá trị hợp đồng bằng số đồng nguyên dương trước khi mở sổ.');
    const amount = d.openingAmount;
    check(typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 && amount <= p.budget,
      'Tổng đã thu khi mở sổ phải là số đồng nguyên từ 0 đến giá trị hợp đồng.');
    p.ledger = {openedAt: now, openedBy: actor, paymentDue: str(d.paymentDue), receipts: []};
    p.ledger.receipts.push({id: crypto.randomUUID(), kind: 'opening', amount, date: today, reference: '', createdAt: now, createdBy: actor});
    log(w, actor, now, `Mở sổ thu tiền cho ${p.name}`, action, p.id, {openingAmount: {before: null, after: amount}});
    return;
  }
  check(ledger, 'Hãy đối chiếu số đã thu và mở sổ cho dự án trước.');
  if (action === 'set_payment_due') {
    check(typeof d.paymentDue === 'string', 'Cần gửi hạn thanh toán hoặc để trống để xóa ngày hẹn.');
    const due = str(d.paymentDue);
    check(due !== ledger.paymentDue, 'Hạn thanh toán chưa thay đổi.');
    const before = ledger.paymentDue;
    ledger.paymentDue = due;
    log(w, actor, now, `Cập nhật hạn thanh toán cho ${p.name}`, action, p.id, {paymentDue: {before, after: due}});
    return;
  }
  if (action === 'record_project_receipt') {
    const amount = d.amount;
    check(typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0, 'Số tiền thu phải là số đồng nguyên dương.');
    check(amount <= p.budget - collected(ledger), 'Số tiền thu vượt quá số còn phải thu.');
    date(d.date, 'Ngày nhận tiền');
    const paidOn = str(d.date);
    check(paidOn >= businessDate(ledger.openedAt) && paidOn <= today, 'Ngày nhận tiền phải từ ngày mở sổ đến hôm nay.');
    const reference = str(d.reference);
    check(reference.length > 0 && reference.length <= 120, 'Nhập mã phiếu hoặc mã giao dịch tối đa 120 ký tự.');
    check(!ledger.receipts.some(r => !r.voided && documentKey(r.reference) === documentKey(reference)), 'Mã chứng từ đã có trên dự án.');
    const receipt = {id: crypto.randomUUID(), kind: 'payment' as const, amount, date: paidOn, reference, createdAt: now, createdBy: actor};
    ledger.receipts.unshift(receipt);
    log(w, actor, now, `Ghi thu ${p.name} · ${reference}`, action, p.id, {amount: {before: null, after: amount}});
    return;
  }
  const receipt = find(ledger.receipts, d.receiptId, 'Phiếu thu');
  check(!receipt.voided, 'Phiếu thu đã được hủy.');
  const reason = str(d.reason);
  check(reason.length > 0 && reason.length <= 500, 'Nhập lý do hủy phiếu tối đa 500 ký tự.');
  if (receipt.kind === 'opening') {
    const corrected = d.openingAmount;
    const payments = collected(ledger) - receipt.amount;
    check(typeof corrected === 'number' && Number.isSafeInteger(corrected) && corrected >= 0 && corrected + payments <= p.budget,
      'Số đầu kỳ sau điều chỉnh phải là số đồng nguyên và tổng thu không được vượt giá trị hợp đồng.');
    check(corrected !== receipt.amount, 'Số đầu kỳ chưa thay đổi.');
    receipt.voided = {at: now, by: actor, reason};
    ledger.receipts.unshift({id: crypto.randomUUID(), kind: 'opening', amount: corrected, date: receipt.date, reference: '', createdAt: now, createdBy: actor});
    log(w, actor, now, `Điều chỉnh số đầu kỳ của ${p.name}`, action, p.id,
      {openingAmount: {before: receipt.amount, after: corrected}, reason: {before: null, after: reason}});
    return;
  }
  receipt.voided = {at: now, by: actor, reason};
  log(w, actor, now, `Hủy phiếu thu ${p.name} · ${receipt.reference || 'Số dư mở sổ'}`, action, p.id,
    {receiptId: {before: null, after: receipt.id}, reason: {before: null, after: reason}});
}
function movePendingCustomerActions(w: Workspace, customer: Customer, from: string | undefined, to: string, actor: string, now: string) {
  if (!from) return;
  const previousId = memberId(w,from);
  if (previousId === to) return;
  for (const action of customer.actions || []) {
    if (action.status !== 'Cần làm' || (action.owner !== previousId && action.owner !== from)) continue;
    const oldOwner = action.owner;
    action.owner = to;
    action.updatedAt = now;
    log(w, actor, now, 'Chuyển việc đang chờ: '+action.title, 'reassign_customer_action', customer.id, {
      owner: {before: oldOwner, after: to}, actionId: {before: action.id, after: action.id},
    });
  }
}

function memberId(w: Workspace, value: string) {
  return (w.team.find(member=>member.id === value) ?? w.team.find(member=>member.name === value))?.id ?? value;
}

function assertNoPendingHandoff(customer: Customer) {
  check(!customer.salesHandoff || customer.salesHandoff.resolution, 'Hãy xử lý đề nghị bàn giao sang Sale đang chờ trước.');
}

type CommandViewer = Pick<AccessViewer,'role'|'memberId'> & Partial<Pick<AccessContext,'userId'|'name'>>;

function applySalesHandoff(w: Workspace, command: Command, actor: string, now: string, viewer?: CommandViewer) {
  check(viewer?.userId, 'Cần đăng nhập để xử lý bàn giao.');
  const customer = find(w.customers,command.id,'Khách hàng');
  const data = command.data ?? {};
  const author = {id:viewer.userId,name:actor,at:now};
  const previous = customer.salesHandoff;
  if (command.action === 'request_sales_handoff') {
    assertNoPendingHandoff(customer);
    check(customer.telesalesOwner && customer.telesalesStatus === 'Đủ điều kiện', 'Chỉ gửi khách đủ điều kiện từ danh sách Telesales.');
    check(!['Tạm ngừng','Không phù hợp'].includes(customer.status), 'Khách hiện không ở trạng thái tiếp nhận.');
    const fromMemberId = ownerId(w,customer.telesalesOwner);
    const toMemberId = ownerId(w,data.recipientId);
    check(fromMemberId !== toMemberId, 'Chọn Sale khác với nhân sự Telesales phụ trách.');
    date(data.dueDate,'Hạn tiếp nhận');
    check(String(data.dueDate) >= businessDate(now), 'Hạn tiếp nhận cần từ hôm nay trở đi.');
    text(data.summary,'Nhu cầu và việc tiếp theo');
    check(str(data.summary).length <= 3000, 'Tóm tắt bàn giao tối đa 3000 ký tự.');
    customer.salesHandoff = {
      id:crypto.randomUUID(), customerName:customer.name, fromMemberId, fromName:ownerName(w,fromMemberId), toMemberId,
      toName:ownerName(w,toMemberId), summary:str(data.summary), dueDate:String(data.dueDate), requested:author,
    };
    customer.updatedAt = now;
    log(w,actor,now,`Đề nghị bàn giao ${customer.name} sang Sale`,command.action,customer.id,{handoff:{before:null,after:structuredClone(customer.salesHandoff)}});
    return;
  }

  check(previous && !previous.resolution && previous.id === data.handoffId, 'Đề nghị bàn giao đã thay đổi.');
  const decision = command.action === 'cancel_sales_handoff' ? 'cancelled' : data.decision;
  check(command.action === 'cancel_sales_handoff' || decision === 'accepted' || decision === 'returned', 'Chọn nhận hoặc trả lại khách.');
  const reason = data.reason ?? '';
  text(reason,'Lý do',decision !== 'accepted');
  check(str(reason).length <= 3000, 'Lý do tối đa 3000 ký tự.');
  const oldOwner = customer.owner;
  if (decision === 'accepted') {
    check(viewer.role === 'account' && viewer.memberId === previous.toMemberId, 'Chỉ Sale được chỉ định mới có thể tiếp nhận.');
    check(customer.telesalesOwner && memberId(w,customer.telesalesOwner) === previous.fromMemberId && customer.telesalesStatus === 'Đủ điều kiện', 'Phân công Telesales đã thay đổi.');
    check(!['Tạm ngừng','Không phù hợp'].includes(customer.status), 'Khách hiện không ở trạng thái tiếp nhận.');
    customer.owner = previous.toMemberId;
    movePendingCustomerActions(w,customer,oldOwner,customer.owner,actor,now);
    movePendingCustomerActions(w,customer,customer.telesalesOwner,customer.owner,actor,now);
    customer.telesalesOwner = '';
    customer.telesalesStatus = 'Đã bàn giao';
    for (const deal of w.deals) {
      if (deal.customerId !== customer.id || ['Đã chốt','Không thành công'].includes(deal.stage) || memberId(w,deal.owner) !== memberId(w,oldOwner) || deal.owner === customer.owner) continue;
      const previousOwner = deal.owner;
      deal.owner = customer.owner;
      log(w,actor,now,`Chuyển cơ hội đang mở: ${deal.name}`,'reassign_deal_after_handoff',deal.id,{owner:{before:previousOwner,after:deal.owner}});
    }
  }
  // Returns and cancellations leave both source assignments and the next follow-up in place.
  check(decision === 'accepted' || decision === 'returned' || decision === 'cancelled', 'Trạng thái bàn giao không hợp lệ.');
  previous.resolution = {...author,decision,reason:str(reason)};
  customer.updatedAt = now;
  const label = {accepted:'Tiếp nhận',returned:'Trả lại',cancelled:'Hủy đề nghị bàn giao'}[decision];
  log(w,actor,now,`${label}: ${customer.name}`,command.action,customer.id,{
    owner:{before:oldOwner,after:customer.owner}, handoff:{before:null,after:structuredClone(previous)},
  });
}

function referenced(w: Workspace, c: Collection, r: Row) {
  if (c === 'customers') return [...w.deals,...w.projects].some(x=>x.customerId===r.id) || w.customers.some(customer=>customer.id!==r.id && customer.relationships?.some(relationship=>relationship.customerId===r.id));
  if (c === 'services') return [...w.deals,...w.projects,...w.assets].some(x=>x.serviceId===r.id);
  if (c === 'projects') return [...w.tasks,...w.contents,...w.changes,...w.issues].some(x=>x.projectId===r.id) || w.deals.some(d=>d.projectId===r.id);
  if (c === 'team') return [...w.customers,...w.deals,...w.projects,...w.tasks,...w.contents,...w.issues].some(x=>x.owner===r.id || x.owner===r.name) || w.customers.some(customer=>customer.telesalesOwner===r.id || customer.telesalesOwner===r.name || customer.actions?.some(action=>action.owner===r.id || action.owner===r.name));
  return false;
}

export function applyCommand(current: Workspace, command: Command, actor: string, now = new Date().toISOString(), viewer?: CommandViewer, liveSales = false): Workspace {
  check(command && typeof command === 'object', 'Yêu cầu không hợp lệ.');
  const prospect=command.action==='create_prospect';
  const w = normalizeWorkspace(current); const d = command.data || {}; const c = prospect?'customers':command.collection; const id = command.id;
  const requirePublicationApproval = liveSales && w.settings.contentApprovalRequired === true;
  check(!['approve_content','request_changes','approve_change','reject_change'].includes(String(command.action)), 'Tính năng duyệt và phát sinh đã được gỡ bỏ.');
  check(typeof d === 'object' && !Array.isArray(d), 'Dữ liệu không hợp lệ.');
  if (isSalesHandoffAction(command.action)) {
    check(liveSales, 'Luồng bàn giao sang Sale chỉ dùng cho dữ liệu công ty.');
    applySalesHandoff(w,command,actor,now,viewer);
    return w;
  }
  if (isSalesAction(command.action)) {
    check(liveSales, 'Luồng duyệt bán hàng chỉ sử dụng trong dữ liệu công ty.');
    const message = applySalesCommand(w, { ...command, action:command.action }, viewer?.userId && viewer.name ? {...viewer, userId:viewer.userId, name:viewer.name} : undefined, now, businessDate(now));
    log(w,actor,now,message,command.action,id);
    return w;
  }
  if (isCollectionAction(command.action)) {
    if (!viewer || !canWriteCollections(command.action,viewer.role)) throw new CRMError('Bạn không có quyền thực hiện thao tác trên sổ thu tiền.', 403);
    applyCollection(w, command, actor, now, viewer, liveSales);
    return w;
  }
  if(command.action==='import_customers' || command.action==='import_prospects'){
    check(Array.isArray(d.rows) && d.rows.length>0 && d.rows.length<=500,'Mỗi lần nhập từ 1 đến 500 khách hàng.');
    const staffImport=command.action==='import_prospects';
    const importOwner=staffImport?requireProspectMember(w,viewer):ownerId(w,d.owner);
    text(d.sourceFile,'Tên file nguồn');check(str(d.sourceFile).length<=255,'Tên file nguồn tối đa 255 ký tự.');
    check(w.customers.length+d.rows.length<=10000,'Đã đạt giới hạn bản ghi của không gian này.');
    if(staffImport)validateProspectEntries(d.rows);
    const entries=staffImport?d.rows as ImportEntry[]:d.rows.map((data,index)=>({rowNumber:index+2,data:data as Record<string,unknown>}));
    const preview=previewCustomerImport(entries,w,importOwner,staffImport?'anonymous':'named');
    const problem=preview.find(row=>row.status!=='ready');check(!problem,problem?`Dòng ${problem.rowNumber}: ${problem.message}`:'Dữ liệu nhập không hợp lệ.');
    for(const item of preview){
      const row=importCustomer(w,item.customer,importOwner,crypto.randomUUID(),now);
      if(staffImport)assignProspect(row,importOwner,viewer?.role==='telesales',now);
      w.customers.push(row as unknown as Customer);
      log(w,actor,now,`Nhập khách hàng: ${row.name} · ${str(d.sourceFile)}`,command.action,row.id,{sourceFile:{before:null,after:str(d.sourceFile)}});
    }
    return w;
  }
  if(command.action==='distribute_customers'){
    check(Array.isArray(d.assignments) && d.assignments.length>0 && d.assignments.length<=500,'Chọn ít nhất một nhân viên telesales nhận khách.');
    text(d.note,'Ghi chú chia khách');check(str(d.note).length<=5000,'Ghi chú chia khách tối đa 5000 ký tự.');date(d.nextFollowUp,'Ngày cần gọi');
    check(typeof d.allowReassign==='boolean','Xác nhận phân công lại không hợp lệ.');
    const usedCustomers=new Set<string>(),usedOwners=new Set<string>();
    const plan:{owner:string;customers:Customer[]}[]=[];
    for(const value of d.assignments){
      check(!!value && typeof value==='object' && !Array.isArray(value),'Phân chia khách hàng không hợp lệ.');
      const assignment=value as Record<string,unknown>,assignedOwner=ownerId(w,assignment.owner);
      check(!usedOwners.has(assignedOwner),'Nhân viên nhận khách bị trùng trong phương án chia.');usedOwners.add(assignedOwner);
      check(Array.isArray(assignment.ids) && assignment.ids.length>0 && assignment.ids.length<=500,'Mỗi nhân viên cần nhận từ 1 đến 500 khách.');
      const customers=assignment.ids.map(customerId=>{
        text(customerId,'Mã khách hàng');check(!usedCustomers.has(String(customerId)),'Một khách hàng không thể được chia cho nhiều nhân viên trong cùng lần.');usedCustomers.add(String(customerId));
        check(usedCustomers.size<=500,'Mỗi lần chia tối đa 500 khách hàng.');
        const customer=find(w.customers,customerId,'Khách hàng');assertNoPendingHandoff(customer);check(safePhone(customer.phone),`${customer.name} chưa có số điện thoại hợp lệ để chuyển telesales.`);
        check(!customer.telesalesOwner || d.allowReassign,`${customer.name} đã có telesales phụ trách. Bật xác nhận phân công lại để tiếp tục.`);
        return customer;
      });
      plan.push({owner:assignedOwner,customers});
    }
    for(const assignment of plan)for(const customer of assignment.customers){
      const previous=structuredClone(customer) as unknown as Row;
      customer.telesalesOwner=assignment.owner;customer.telesalesStatus='Chờ gọi';customer.telesalesQueuedAt=now;customer.telesalesHandoffNote=str(d.note);customer.nextFollowUp=str(d.nextFollowUp);customer.updatedAt=now;
      movePendingCustomerActions(w, customer, previous.telesalesOwner as string | undefined, assignment.owner, actor, now);
      const previousOwner=previous.telesalesOwner?ownerName(w,String(previous.telesalesOwner)):'chưa phân công';
      log(w,actor,now,`Chia khách telesales: ${customer.name} · ${previousOwner} → ${ownerName(w,assignment.owner)} · ${str(d.note)}`,'distribute_customers',customer.id,diff(previous,customer as unknown as Row,['telesalesOwner','telesalesStatus','telesalesQueuedAt','telesalesHandoffNote','nextFollowUp']));
    }
    return w;
  }
  if (prospect || ['create','update','delete'].includes(command.action)) {
    check(c !== 'changes', 'Tính năng phát sinh đã được gỡ bỏ; dữ liệu cũ chỉ được lưu trữ.');
    check(c && collections.includes(c), 'Loại dữ liệu không hợp lệ.');
    const list = rows(w,c);
    if (prospect || command.action === 'create') {
      check(list.length < 10000, 'Đã đạt giới hạn bản ghi của không gian này.');
      const r: Row = {id:crypto.randomUUID(),...defaults(c,now),...pick(c,d)};
      if(prospect)assignProspect(r,requireProspectMember(w,viewer),viewer?.role==='telesales',now);
      if (c === 'projects') { check(r.status !== 'Hoàn tất', 'Hãy nghiệm thu để hoàn tất dự án.'); r.originalDueDate=r.dueDate; }
      if (c === 'deals') {
        if (viewer?.role === 'account') r.owner=viewer.memberId;
        if (liveSales) {
          const customer = find(w.customers,r.customerId,'Khách hàng');
          check(customer.telesalesStatus !== 'Đủ điều kiện', 'Cần Sale tiếp nhận khách Telesales trước khi tạo cơ hội.');
        }
        check(r.stage !== 'Đã chốt', 'Hãy dùng thao tác Chốt cơ hội để tạo dự án.');
        if (liveSales) check(!QUOTE_STAGES.has(String(r.stage)), 'Lập và duyệt báo giá trước khi chuyển sang giai đoạn này.');
        if (liveSales && r.stage === 'Không thành công') text(r.lossReason,'Lý do không thành công');
        if(own(r,'probability'))number(r.probability,'Xác suất',100);
        r.probability=r.stage==='Không thành công'?0:(r.probability??DEAL_PROBABILITIES[String(r.stage)]??10);
        r.createdAt=now;r.createdBy=actor;r.stageChangedAt=now;r.stageHistory=[{stage:r.stage,at:now,actor}];
      }
      if (['tasks','contents','issues'].includes(c)) project(w,r.projectId,true);
      if (c === 'contents' && requirePublicationApproval) {
        check(r.status !== 'Đã đăng', 'Lưu và duyệt nội dung trước khi ghi đã đăng.');
        if (r.status === 'Sẵn sàng đăng') text(r.body,'Nội dung gửi duyệt');
      }
      if (c === 'customers') { normalizeCustomerInput(w,r); checkCustomerDuplicates(w,r,undefined); }
      validate(w,c,r); list.push(r);
      log(w,actor,now,prospect?`Thêm khách tự khai thác: ${recordLabel(r)}`:`Tạo ${recordLabel(r)}`,command.action,r.id);
      return w;
    }
    const r = find(list,id,'Bản ghi');
    if (command.action === 'delete') {
      check(c !== 'customers' || !r.salesHandoff, 'Hồ sơ đã có lịch sử bàn giao. Dùng trạng thái Tạm ngừng để lưu hồ sơ.');
      if (['tasks','contents','issues'].includes(c)) project(w, r.projectId, true);
      if (c === 'projects') project(w, id, true);
      check(!(c === 'projects' && r.ledger), 'Không thể xóa dự án đã mở sổ thu tiền.');
      check(!(c === 'projects' && r.contract), 'Không thể xóa dự án đã xác nhận hợp đồng.');
      check(!referenced(w,c,r), 'Bản ghi đang được sử dụng; hãy xử lý các liên kết trước.');
      check(!(c === 'deals' && r.projectId), 'Không thể xóa cơ hội đã tạo dự án.');
      check(!(c === 'deals' && Array.isArray(r.quotes) && r.quotes.length), 'Không thể xóa cơ hội có phiên bản báo giá.');
      check(!(c === 'contents' && r.status === 'Đã đăng'), 'Không thể xóa nội dung đã đăng.');
      check(!(c === 'contents' && r.approvedAt), 'Không thể xóa nội dung có bằng chứng xác nhận đã lưu.');
      check(!(c === 'contents' && Array.isArray(r.history) && r.history.some((entry:Record<string,unknown>)=>entry.approvedAt)), 'Không thể xóa nội dung có lịch sử đã được duyệt.');
      list.splice(list.indexOf(r),1); log(w,actor,now,`Xóa ${recordLabel(r)}`,'delete',r.id); return w;
    }
    const update = pick(c,d);
    const before = structuredClone(r);
    if (c === 'customers' && (own(update,'owner') && memberId(w,String(update.owner)) !== r.owner ||
      ['Tạm ngừng','Không phù hợp'].includes(String(update.status)) && update.status !== r.status)) assertNoPendingHandoff(r as unknown as Customer);
    if (c === 'deals') {
      check(r.stage !== 'Đã chốt', 'Cơ hội đã chốt; hãy quản lý thay đổi trong dự án.');check(update.stage !== 'Đã chốt', 'Hãy dùng thao tác Chốt cơ hội để tạo dự án.');
      if (liveSales) {
        const deal = find(w.deals,id,'Cơ hội');
        if (deal.quotes?.length) for (const key of ['customerId','serviceId']) check(!own(update,key) || update[key]===r[key], 'Khách hàng và dịch vụ đã gắn với báo giá.');
        if (update.stage !== r.stage && QUOTE_STAGES.has(String(update.stage))) {
          check(deal.quotes?.some(quote=>quote.status === 'approved' && quote.validUntil >= businessDate(now)), 'Cần báo giá đã duyệt còn hiệu lực để chuyển sang giai đoạn này.');
        }
        if (update.stage === 'Không thành công' && r.stage !== 'Không thành công') {
          text(update.lossReason,'Lý do không thành công');
          const win = deal.winRequests?.at(-1);
          check(deal.quotes?.at(-1)?.status !== 'submitted' && (!win || win.reviewed), 'Cần xử lý yêu cầu đang chờ trước khi đóng cơ hội.');
        }
      }
      if(own(update,'probability'))number(update.probability,'Xác suất',100);
      if(own(update,'stage'))oneOf(update.stage,STAGES,'Giai đoạn');
      if(own(update,'stage') && update.stage!==r.stage){
        const history=(r.stageHistory as {stage:string;at:string;actor:string}[] | undefined) || [];
        history.push({stage:String(update.stage),at:now,actor});r.stageHistory=history;r.stageChangedAt=now;
        if(!own(update,'probability'))update.probability=DEAL_PROBABILITIES[String(update.stage)]??10;
      }
      if((update.stage??r.stage)==='Không thành công')update.probability=0;
    }
    if (c === 'projects') {
      if (r.contract) for (const key of ['budget','scope','exclusions','revisions']) check(!own(update,key) || update[key]===r[key], 'Dùng luồng điều chỉnh hợp đồng để cập nhật giá trị hoặc phạm vi đã xác nhận.');
      if (r.ledger && own(update, 'budget')) {
        const ledger = project(w, id).ledger!;
        check(typeof update.budget === 'number' && Number.isSafeInteger(update.budget) && update.budget >= collected(ledger),
          'Giá trị hợp đồng phải là số đồng nguyên và ít nhất bằng số đã thu.');
      }
      check(r.status !== 'Hoàn tất', 'Dự án đã hoàn tất.'); check(update.status !== 'Hoàn tất', 'Hãy dùng thao tác Nghiệm thu để hoàn tất.');
      for (const key of ['customerId','serviceId']) check(!own(update,key) || update[key]===r[key], 'Không thể đổi khách hàng hoặc dịch vụ của dự án đã tạo.');
      check(!own(update,'owner') || update.owner===r.owner, 'Đổi người phụ trách qua thao tác Bàn giao.');
    }
    if (['tasks','contents','issues'].includes(c)) { project(w,r.projectId,true); check(!own(update,'projectId') || update.projectId===r.projectId, 'Không được chuyển bản ghi sang dự án khác.'); }
    if (c === 'issues') check(!['Đã xử lý','Đã giải quyết'].includes(String(update.status)) || ['Đã xử lý','Đã giải quyết'].includes(String(r.status)), 'Hãy dùng thao tác giải quyết để ghi kết quả.');
    if (c === 'team' && update.name && update.name !== r.name) {
      for (const records of [w.customers,w.deals,w.projects,w.tasks,w.contents,w.issues]) for (const item of records) if (item.owner===r.name) item.owner=String(update.name);
    }
    if (c === 'contents') {
      const contentChanged = ['body','title','url','channel'].some(key=>own(update,key) && update[key]!==r[key]);
      if (requirePublicationApproval) {
        if (update.status==='Đã đăng' && r.status!=='Đã đăng') {
          check(!contentChanged && r.status==='Sẵn sàng đăng' && hasPublicationApproval(r as unknown as Content), 'Phiên bản hiện tại cần được duyệt trước khi ghi đã đăng.');
        }
        if (update.status==='Sẵn sàng đăng') text(own(update,'body') ? update.body : r.body,'Nội dung gửi duyệt');
      }
      if (contentChanged) {
        const history = (r.history as Record<string,unknown>[] | undefined) || [];
        history.push({version:r.version,title:r.title,body:r.body,url:r.url,channel:r.channel,approvedAt:r.approvedAt,approvedBy:r.approvedBy,confirmation:r.approvalConfirmation});
        r.history=history; r.version=Number(r.version)+1;
        delete r.approvedAt; delete r.approvedBy; delete r.approvedVersion; delete r.approvalConfirmation;
        delete r.publicationReview;
        update.status='Đang sản xuất';
      }
    }
    Object.assign(r,update);
    if (c === 'customers') {
      normalizeCustomerInput(w,r); checkCustomerDuplicates(w,r,before); r.updatedAt=now;
      movePendingCustomerActions(w, r as unknown as Customer, before.owner as string, r.owner as string, actor, now);
    }
    validate(w,c,r);
    const details=diff(before,r,fields[c]);
    let message=`Cập nhật ${recordLabel(r)}`;
    if (c==='customers' && before.owner!==r.owner) message+=`: bàn giao từ ${ownerName(w,String(before.owner))} cho ${ownerName(w,String(r.owner))}`;
    log(w,actor,now,message,'update',r.id,details); return w;
  }
  if (command.action === 'update_settings') {
    if (own(d,'companyName')) {text(d.companyName,'Tên công ty');w.settings.companyName=str(d.companyName);}
    if (own(d,'slogan')) {text(d.slogan,'Mô tả',false);w.settings.slogan=str(d.slogan);}
    if (own(d,'escalationHours')) {number(d.escalationHours,'Ngưỡng cảnh báo',8760);check(Number(d.escalationHours)>=1,'Ngưỡng cảnh báo tối thiểu 1 giờ.');w.settings.escalationHours=Number(d.escalationHours);}
    const before = w.settings.contentApprovalRequired === true;
    if (own(d,'contentApprovalRequired')) {
      if (!liveSales || viewer?.role!=='owner') throw new CRMError('Chủ sở hữu thay đổi quy định duyệt nội dung trong dữ liệu công ty.',403);
      check(typeof d.contentApprovalRequired==='boolean','Quy định duyệt nội dung không hợp lệ.');
      w.settings.contentApprovalRequired = d.contentApprovalRequired;
    }
    log(w,actor,now,'Cập nhật cài đặt công ty','settings',undefined,own(d,'contentApprovalRequired')?{contentApprovalRequired:{before,after:w.settings.contentApprovalRequired}}:undefined); return w;
  }
  if (command.action === 'review_content_publication') {
    if ((viewer?.role!=='owner' && viewer?.role!=='manager') || !viewer.userId) throw new CRMError('Chức năng dành cho Chủ sở hữu hoặc Quản lý.',403);
    check(requirePublicationApproval,'Công ty chưa bật duyệt nội dung trước khi đăng.');
    const content=find(w.contents,id,'Nội dung'); project(w,content.projectId,true);
    check(content.status==='Sẵn sàng đăng' && content.version===d.version,'Nội dung hoặc phiên bản chờ duyệt đã thay đổi.');
    check(d.decision==='approved' || d.decision==='returned','Chọn duyệt hoặc trả lại nội dung.');
    text(d.reason,d.decision==='approved'?'Căn cứ duyệt':'Lý do trả lại');
    check(str(d.reason).length<=3000,'Căn cứ hoặc lý do tối đa 3000 ký tự.');
    const before = content.publicationReview;
    content.publicationReview = {id:viewer.userId,name:actor,at:now,version:content.version,decision:d.decision,reason:str(d.reason)};
    if (d.decision==='approved') {
      text(content.body,'Nội dung gửi duyệt');
      check(!hasPublicationApproval(content),'Phiên bản này đã được duyệt.');
      content.approvedVersion=content.version; content.approvedAt=now; content.approvedBy=actor; content.approvalConfirmation=str(d.reason);
    } else {
      content.status='Đang sản xuất';
      delete content.approvedVersion; delete content.approvedAt; delete content.approvedBy; delete content.approvalConfirmation;
    }
    log(w,actor,now,`${d.decision==='approved'?'Duyệt':'Trả lại'} nội dung ${content.title} · V${content.version}`,command.action,content.id,
      {review:{before:before ?? null,after:content.publicationReview}});
    return w;
  }
  if(command.action==='add_customer_note' || command.action==='update_customer_note') {
    const customer=find(w.customers,id,'Khách hàng');text(d.body,'Nội dung ghi chú');
    if(command.action==='add_customer_note'){
      const note:CustomerNote={id:crypto.randomUUID(),body:str(d.body),createdAt:now,actor};customer.notesLog=[note,...(customer.notesLog || [])];
      log(w,actor,now,`Thêm ghi chú: ${customer.name}`,'add_customer_note',customer.id,{body:{before:null,after:note.body}});
    }else{
      const note=find(customer.notesLog || [],d.noteId,'Ghi chú');const original=note.body;note.body=str(d.body);note.updatedAt=now;
      log(w,actor,now,`Sửa ghi chú: ${customer.name}`,'update_customer_note',customer.id,{body:{before:original,after:note.body},noteId:{before:note.id,after:note.id}});
    }
    customer.updatedAt=now;return w;
  }
  if(command.action==='upsert_customer_action') {
    const customer=find(w.customers,id,'Khách hàng');text(d.title,'Tên hoạt động');oneOf(d.type,['Công việc','Cuộc gọi','Cuộc hẹn'],'Loại hoạt động');date(d.dueDate,'Ngày thực hiện');
    if(own(d,'time')){text(d.time,'Giờ thực hiện',false);check(!d.time || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(d.time)),'Giờ thực hiện cần định dạng HH:mm hợp lệ.');}
    if(own(d,'notes'))text(d.notes,'Ghi chú hoạt động',false);
    const assignedOwner=ownerId(w,d.owner);const actions=customer.actions || [];
    const existing=own(d,'actionId')?find(actions,d.actionId,'Hoạt động'):undefined;
    if(existing)check(existing.status==='Cần làm','Hoạt động đã hoàn tất hoặc đã hủy không thể chỉnh sửa.');
    const before=existing?structuredClone(existing):undefined;
    const action:CustomerAction=existing || {id:crypto.randomUUID(),title:'',type:'Công việc',dueDate:'',owner:assignedOwner,status:'Cần làm',notes:'',createdAt:now,updatedAt:now};
    action.title=str(d.title);action.type=d.type as CustomerAction['type'];action.dueDate=str(d.dueDate);action.time=str(d.time);action.owner=assignedOwner;action.notes=str(d.notes);action.updatedAt=now;
    if(!existing)actions.unshift(action);customer.actions=actions;customer.updatedAt=now;
    log(w,actor,now,`${existing?'Cập nhật':'Tạo'} ${action.type.toLowerCase()}: ${action.title} · ${customer.name}`,'upsert_customer_action',customer.id,{action:{before:before || null,after:structuredClone(action)}});
    return w;
  }
  if(command.action==='complete_customer_action' || command.action==='cancel_customer_action') {
    const customer=find(w.customers,id,'Khách hàng');const action=find(customer.actions || [],d.actionId,'Hoạt động');
    check(action.status==='Cần làm','Hoạt động đã hoàn tất hoặc đã hủy không thể thay đổi.');
    const completed=command.action==='complete_customer_action';text(completed?d.result:d.reason,completed?'Kết quả thực hiện':'Lý do hủy');
    const before=structuredClone(action);action.status=completed?'Hoàn tất':'Đã hủy';action.result=str(completed?d.result:d.reason);action.updatedAt=now;if(completed)action.completedAt=now;customer.updatedAt=now;
    log(w,actor,now,`${completed?'Hoàn tất':'Hủy'} ${action.type.toLowerCase()}: ${action.title} · ${customer.name}`,command.action,customer.id,{action:{before,after:structuredClone(action)}});
    return w;
  }
  if (command.action === 'transfer_to_telesales') {
    check(Array.isArray(d.ids) && d.ids.length>0 && d.ids.length<=500 && d.ids.every(value=>typeof value==='string'),'Chọn từ 1 đến 500 khách hàng hợp lệ.');
    const nextOwner=ownerId(w,d.owner);text(d.note,'Ghi chú chuyển telesales');
    if(own(d,'nextFollowUp')){text(d.nextFollowUp,'Ngày liên hệ tiếp',false);date(d.nextFollowUp,'Ngày liên hệ tiếp',false);}
    const targets=[...new Set(d.ids as string[])].map(customerId=>find(w.customers,customerId,'Khách hàng'));
    // Every target is validated before changing the queue, preserving atomicity.
    for(const customer of targets){assertNoPendingHandoff(customer);check(safePhone(customer.phone),`${customer.name} chưa có số điện thoại hợp lệ để chuyển telesales.`);}
    for(const customer of targets) {
      const previous=structuredClone(customer) as unknown as Row;
      customer.telesalesOwner=nextOwner;customer.telesalesStatus='Chờ gọi';customer.telesalesQueuedAt=now;customer.telesalesHandoffNote=str(d.note);customer.updatedAt=now;
      if(own(d,'nextFollowUp'))customer.nextFollowUp=str(d.nextFollowUp);
      const previousOwner=previous.telesalesOwner?ownerName(w,String(previous.telesalesOwner)):'chưa phân công';
      movePendingCustomerActions(w, customer, previous.telesalesOwner as string | undefined, nextOwner, actor, now);
      const details=diff(previous,customer as unknown as Row,['telesalesOwner','telesalesStatus','telesalesQueuedAt','telesalesHandoffNote','nextFollowUp']);
      log(w,actor,now,`Chuyển telesales: ${customer.name} · ${previousOwner} → ${ownerName(w,nextOwner)} · ${str(d.note)}`,'transfer_to_telesales',customer.id,details);
    }
    return w;
  }
  if (command.action === 'log_telesales_call') {
    const customer=find(w.customers,id,'Khách hàng');
    check(customer.telesalesOwner && ['Chờ gọi','Đang chăm sóc','Hẹn gọi lại'].includes(customer.telesalesStatus || ''),'Khách hàng chưa có trong hàng chờ gọi đang hoạt động. Hãy chuyển hoặc xếp lại vào telesales trước.');
    owner(w,customer.telesalesOwner);check(safePhone(customer.phone),'Khách hàng chưa có số điện thoại hợp lệ để ghi cuộc gọi.');
    oneOf(d.outcome,CALL_OUTCOMES,'Kết quả cuộc gọi');text(d.note,'Ghi chú cuộc gọi');
    const needsFollowup=['Không nghe máy','Máy bận','Hẹn gọi lại'].includes(String(d.outcome));
    if(needsFollowup)date(d.nextFollowUp,'Ngày gọi lại');
    else if(own(d,'nextFollowUp'))date(d.nextFollowUp,'Ngày liên hệ tiếp',false);
    if(own(d,'nextAction'))text(d.nextAction,'Việc tiếp theo',false);
    const previous=structuredClone(customer) as unknown as Row;
    const states:Record<string,NonNullable<Customer['telesalesStatus']>>={'Không nghe máy':'Đang chăm sóc','Máy bận':'Đang chăm sóc','Hẹn gọi lại':'Hẹn gọi lại','Quan tâm':'Đủ điều kiện','Đặt lịch tư vấn':'Đủ điều kiện','Không phù hợp':'Không phù hợp','Sai số':'Sai số'};
    customer.telesalesStatus=states[String(d.outcome)];
    number(customer.telesalesAttempts,'Số lần gọi',1000000);check(Number.isInteger(customer.telesalesAttempts),'Số lần gọi phải là số nguyên.');
    customer.telesalesAttempts=(customer.telesalesAttempts || 0)+1;customer.telesalesLastCallAt=now;customer.telesalesLastOutcome=str(d.outcome);customer.lastContactAt=now;customer.updatedAt=now;
    if(own(d,'nextFollowUp'))customer.nextFollowUp=str(d.nextFollowUp);
    if(own(d,'nextAction'))customer.nextAction=str(d.nextAction);
    if(['Không phù hợp','Sai số'].includes(String(d.outcome)))customer.nextFollowUp='';
    if(d.outcome==='Không phù hợp')customer.status='Không phù hợp';
    const interaction:CustomerInteraction={id:crypto.randomUUID(),at:now,channel:'Điện thoại',outcome:str(d.outcome),note:str(d.note),actor,nextFollowUp:customer.nextFollowUp || '',nextAction:customer.nextAction || ''};
    customer.interactions=[interaction,...(customer.interactions || [])];
    log(w,actor,now,`Telesales gọi ${customer.name} · ${str(d.outcome)} · Lần ${customer.telesalesAttempts}`,'log_telesales_call',customer.id,diff(previous,customer as unknown as Row,['telesalesStatus','telesalesAttempts','telesalesLastCallAt','telesalesLastOutcome','nextFollowUp','nextAction','status']));
    return w;
  }
  if (command.action === 'log_contact') {
    const customer=find(w.customers,id,'Khách hàng');
    oneOf(d.channel,CONTACT_CHANNELS,'Kênh liên hệ');text(d.outcome,'Kết quả liên hệ');text(d.note,'Ghi chú liên hệ');
    if(own(d,'nextFollowUp'))date(d.nextFollowUp,'Ngày liên hệ tiếp',false);
    if(own(d,'nextAction'))text(d.nextAction,'Việc tiếp theo',false);
    const interaction:CustomerInteraction={id:crypto.randomUUID(),at:now,channel:d.channel as CustomerInteraction['channel'],outcome:str(d.outcome),note:str(d.note),actor};
    if(own(d,'nextFollowUp')){customer.nextFollowUp=str(d.nextFollowUp);interaction.nextFollowUp=customer.nextFollowUp;}
    if(own(d,'nextAction')){customer.nextAction=str(d.nextAction);interaction.nextAction=customer.nextAction;}
    customer.interactions=[interaction,...(customer.interactions || [])];customer.lastContactAt=now;customer.updatedAt=now;
    log(w,actor,now,`${d.channel}: ${customer.name} · ${interaction.outcome}`,'log_contact',customer.id);
    return w;
  }
  if (command.action === 'handoff_customer') {
    const customer=find(w.customers,id,'Khách hàng');const nextOwner=ownerId(w,d.owner);text(d.note,'Nội dung bàn giao');
    assertNoPendingHandoff(customer);
    check(nextOwner!==customer.owner,'Người nhận đang phụ trách khách hàng này.');const previous=customer.owner;
    customer.owner=nextOwner;customer.updatedAt=now;
    movePendingCustomerActions(w, customer, previous, nextOwner, actor, now);
    log(w,actor,now,`Bàn giao ${customer.name} từ ${ownerName(w,previous)} cho ${ownerName(w,nextOwner)}: ${str(d.note)}`,'handoff_customer',customer.id,{owner:{before:previous,after:nextOwner}});
    return w;
  }
  if (command.action === 'bulk_update_customers') {
    check(Array.isArray(d.ids) && d.ids.length>0 && d.ids.length<=500 && d.ids.every(value=>typeof value==='string'),'Chọn từ 1 đến 500 khách hàng hợp lệ.');
    const ids=[...new Set(d.ids as string[])];const update:Record<string,unknown>={};
    for(const key of ['owner','status','priority','nextFollowUp'])if(own(d,key))update[key]=d[key];
    check(Object.keys(update).length>0,'Chọn ít nhất một thông tin cần cập nhật.');
    if(own(update,'owner'))update.owner=ownerId(w,update.owner);
    if(own(update,'status'))oneOf(update.status,CUSTOMER_STATUSES,'Trạng thái khách hàng');
    if(own(update,'priority'))oneOf(update.priority,['Cao','Trung bình','Thấp'],'Mức ưu tiên');
    if(own(update,'nextFollowUp')){text(update.nextFollowUp,'Ngày liên hệ tiếp',false);date(update.nextFollowUp,'Ngày liên hệ tiếp',false);}
    const targets=ids.map(customerId=>find(w.customers,customerId,'Khách hàng'));
    for(const customer of targets) {
      if (own(update,'owner') && update.owner !== customer.owner || ['Tạm ngừng','Không phù hợp'].includes(String(update.status)) && update.status !== customer.status) assertNoPendingHandoff(customer);
      const previous=structuredClone(customer) as unknown as Row;Object.assign(customer,update);customer.updatedAt=now;
      if (own(update,'owner')) movePendingCustomerActions(w, customer, previous.owner as string, customer.owner, actor, now);
      const details=diff(previous,customer as unknown as Row,Object.keys(update));
      let message=`Cập nhật nhóm: ${customer.name}`;
      if(own(update,'owner') && previous.owner!==customer.owner)message+=` · ${ownerName(w,String(previous.owner))} → ${ownerName(w,customer.owner)}`;
      log(w,actor,now,message,'bulk_update_customers',customer.id,details);
    }
    return w;
  }
  if (command.action === 'win_deal') {
    check(!liveSales,'Hãy đề nghị chốt thắng từ báo giá đã duyệt để Quản lý hoặc Chủ sở hữu xác nhận.');
    const deal=find(w.deals,id,'Cơ hội'); check(!deal.projectId && deal.stage!=='Đã chốt','Cơ hội này đã được chốt.');
    const service=find(w.services,deal.serviceId,'Dịch vụ'); find(w.customers,deal.customerId,'Khách hàng');
    text(deal.scope || service.deliverables,'Phạm vi dịch vụ');
    const today=businessDate(now);const due=new Date(today+'T00:00:00Z'); due.setUTCDate(due.getUTCDate()+service.duration);
    const dueDate = str(d.dueDate) || due.toISOString().slice(0,10); date(dueDate,'Deadline');
    const p: Project={id:crypto.randomUUID(),name:deal.name,customerId:deal.customerId,serviceId:deal.serviceId,owner:deal.owner,status:'Đang triển khai',startDate:today,dueDate,originalDueDate:dueDate,budget:deal.value,cost:0,scope:deal.scope || service.deliverables,exclusions:service.exclusions,revisions:service.revisions,acceptance:''};
    validate(w,'projects',p as unknown as Row); w.projects.push(p); deal.stage='Đã chốt';deal.probability=100;deal.stageChangedAt=now;deal.stageHistory=[...(deal.stageHistory || []),{stage:'Đã chốt',at:now,actor}];deal.projectId=p.id; log(w,actor,now,`Chốt ${deal.name} và tạo dự án`,'win_deal',p.id); return w;
  }
  if (command.action === 'handoff') {
    const p=project(w,id,true); owner(w,d.owner); text(d.note,'Nội dung bàn giao'); check(d.owner!==p.owner,'Người nhận đang phụ trách dự án này.');
    const old=p.owner; p.owner=str(d.owner); p.handoffNote=str(d.note);log(w,actor,now,`Bàn giao ${p.name} từ ${ownerName(w,old)} cho ${ownerName(w,p.owner)}: ${p.handoffNote}`,'handoff',p.id); return w;
  }
  if (command.action === 'resolve_issue') {
    const issue=find(w.issues,id,'Vướng mắc'); project(w,issue.projectId,true); check(!['Đã xử lý','Đã giải quyết'].includes(issue.status),'Vướng mắc đã được xử lý.');text(d.resolution,'Kết quả xử lý');issue.status='Đã giải quyết';issue.resolution=str(d.resolution);issue.resolvedAt=now;log(w,actor,now,`Giải quyết ${issue.title}`,'resolve_issue',issue.id);return w;
  }
  if (command.action === 'reopen_project') {
    const p = project(w, id);
    check(p.status === 'Hoàn tất', 'Chỉ mở lại dự án đã hoàn tất.');
    text(d.reason, 'Lý do mở lại');
    log(w, actor, now, 'Mở lại dự án '+p.name+': '+str(d.reason), 'reopen_project', p.id, {
      status: {before: p.status, after: 'Đang triển khai'},
      acceptance: {before: p.acceptance, after: ''},
      acceptanceRecord: {before:p.acceptanceRecord ?? null,after:null},
      reason: {before:null,after:str(d.reason)},
    });
    p.status = 'Đang triển khai';
    p.acceptance = '';
    delete p.acceptanceRecord;
    return w;
  }
  if (command.action === 'complete_project') {
    const p=project(w,id,true);
    const open=projectOpenWork(w,p.id);
    const remaining=[open.tasks&&`${open.tasks} công việc chưa hoàn tất`,open.contents&&`${open.contents} nội dung chưa đăng`,open.issues&&`${open.issues} vướng mắc chưa xử lý`].filter(Boolean);
    const exceptionReason = str(d.exceptionReason);
    if (remaining.length && !exceptionReason) throw new CRMError(`Còn ${remaining.join(', ')}.`);
    if (exceptionReason) {
      if (!liveSales || viewer?.role!=='owner' || !viewer.userId) throw new CRMError('Chỉ Chủ sở hữu được xác nhận ngoại lệ nghiệm thu.',403);
      check(remaining.length && exceptionReason.length<=3000,'Cần hạng mục còn mở và lý do ngoại lệ tối đa 3000 ký tự.');
    }
    text(d.acceptance,'Bằng chứng nghiệm thu');
    const previous=p.acceptance;
    p.acceptance=str(d.acceptance);
    p.status='Hoàn tất';
    if (viewer?.userId) p.acceptanceRecord={actor:{id:viewer.userId,name:actor,at:now},evidence:p.acceptance,exception:exceptionReason?{reason:exceptionReason,open}:undefined};
    log(w,actor,now,`Nghiệm thu và hoàn tất ${p.name}${exceptionReason?' · Ngoại lệ':''}`,'complete_project',p.id,{acceptance:{before:previous,after:p.acceptance},acceptanceRecord:{before:null,after:p.acceptanceRecord ?? null}});
    return w;
  }
  throw new CRMError('Thao tác không được hỗ trợ.');
}
