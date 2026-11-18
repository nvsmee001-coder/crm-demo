import type { Activity, Collection, Command, Customer, CustomerAction, CustomerNote, CustomerInteraction, Project, Workspace } from './crm-types.js';
import { CONTENT_STATUSES, CUSTOMER_STATUSES, CONTACT_CHANNELS, CALL_OUTCOMES, DEAL_PROBABILITIES, PROJECT_STATUSES, STAGES, TASK_STATUSES } from './crm-types.js';

export class CRMError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
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
function ownerId(w:Workspace,value:unknown) {owner(w,value);return w.team.find(member=>member.id===value || member.name===value)!.id;}

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
  deals: ['name','customerId','serviceId','value','stage','owner','closeDate','nextAction','scope','probability','description'],
  projects: ['name','customerId','serviceId','owner','status','startDate','dueDate','budget','cost','scope','exclusions','revisions','acceptance'],
  tasks: ['projectId','name','owner','status','dueDate','hours','hourlyCost','notes'],
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
export function previewCustomerImport(input:{rowNumber:number;data:Record<string,unknown>}[],workspace:Workspace,defaultOwner:string):CustomerImportPreviewRow[] {
  check(Array.isArray(input) && input.length<=500,'Mỗi lần nhập tối đa 500 khách hàng.');
  const phoneOwners=new Map<string,string>(),emailOwners=new Map<string,string>();
  for(const customer of workspace.customers){
    for(const value of contactValues(customer as unknown as Row,'phone'))phoneOwners.set(value,`CRM: ${customer.name}`);
    for(const value of contactValues(customer as unknown as Row,'email'))emailOwners.set(value,`CRM: ${customer.name}`);
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
function checkComplete(w: Workspace, p: Project) {
  check(!w.tasks.some(t => t.projectId === p.id && t.status !== 'Hoàn tất'), 'Còn công việc chưa hoàn tất.');
  check(!w.contents.some(t => t.projectId === p.id && t.status !== 'Đã đăng'), 'Còn nội dung chưa đăng.');
  check(!w.issues.some(t => t.projectId === p.id && !['Đã xử lý','Đã giải quyết'].includes(t.status)), 'Còn vướng mắc chưa xử lý.');
}
function referenced(w: Workspace, c: Collection, r: Row) {
  if (c === 'customers') return [...w.deals,...w.projects].some(x=>x.customerId===r.id) || w.customers.some(customer=>customer.id!==r.id && customer.relationships?.some(relationship=>relationship.customerId===r.id));
  if (c === 'services') return [...w.deals,...w.projects,...w.assets].some(x=>x.serviceId===r.id);
  if (c === 'projects') return [...w.tasks,...w.contents,...w.changes,...w.issues].some(x=>x.projectId===r.id) || w.deals.some(d=>d.projectId===r.id);
  if (c === 'team') return [...w.customers,...w.deals,...w.projects,...w.tasks,...w.contents,...w.issues].some(x=>x.owner===r.id || x.owner===r.name) || w.customers.some(customer=>customer.telesalesOwner===r.id || customer.telesalesOwner===r.name || customer.actions?.some(action=>action.owner===r.id || action.owner===r.name));
  return false;
}

export function applyCommand(current: Workspace, command: Command, actor: string, now = new Date().toISOString()): Workspace {
  check(command && typeof command === 'object', 'Yêu cầu không hợp lệ.');
  const w = normalizeWorkspace(current); const d = command.data || {}; const c = command.collection; const id = command.id;
  check(!['approve_content','request_changes','approve_change','reject_change'].includes(String(command.action)), 'Tính năng duyệt và phát sinh đã được gỡ bỏ.');
  check(typeof d === 'object' && !Array.isArray(d), 'Dữ liệu không hợp lệ.');
  if(command.action==='import_customers'){
    check(Array.isArray(d.rows) && d.rows.length>0 && d.rows.length<=500,'Mỗi lần nhập từ 1 đến 500 khách hàng.');
    const importOwner=ownerId(w,d.owner);text(d.sourceFile,'Tên file nguồn');check(str(d.sourceFile).length<=255,'Tên file nguồn tối đa 255 ký tự.');
    check(w.customers.length+d.rows.length<=10000,'Đã đạt giới hạn bản ghi của không gian này.');
    const preview=previewCustomerImport(d.rows.map((data,index)=>({rowNumber:index+2,data:data as Record<string,unknown>})),w,importOwner);
    const problem=preview.find(row=>row.status!=='ready');check(!problem,problem?`Dòng ${problem.rowNumber}: ${problem.message}`:'Dữ liệu nhập không hợp lệ.');
    for(const item of preview){
      const row=importCustomer(w,item.customer,importOwner,crypto.randomUUID(),now);
      checkCustomerDuplicates(w,row);w.customers.push(row as unknown as Customer);
      log(w,actor,now,`Nhập khách hàng: ${row.name} · ${str(d.sourceFile)}`,'import_customers',row.id,{sourceFile:{before:null,after:str(d.sourceFile)}});
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
        const customer=find(w.customers,customerId,'Khách hàng');check(safePhone(customer.phone),`${customer.name} chưa có số điện thoại hợp lệ để chuyển telesales.`);
        check(!customer.telesalesOwner || d.allowReassign,`${customer.name} đã có telesales phụ trách. Bật xác nhận phân công lại để tiếp tục.`);
        return customer;
      });
      plan.push({owner:assignedOwner,customers});
    }
    for(const assignment of plan)for(const customer of assignment.customers){
      const previous=structuredClone(customer) as unknown as Row;
      customer.telesalesOwner=assignment.owner;customer.telesalesStatus='Chờ gọi';customer.telesalesQueuedAt=now;customer.telesalesHandoffNote=str(d.note);customer.nextFollowUp=str(d.nextFollowUp);customer.updatedAt=now;
      const previousOwner=previous.telesalesOwner?ownerName(w,String(previous.telesalesOwner)):'chưa phân công';
      log(w,actor,now,`Chia khách telesales: ${customer.name} · ${previousOwner} → ${ownerName(w,assignment.owner)} · ${str(d.note)}`,'distribute_customers',customer.id,diff(previous,customer as unknown as Row,['telesalesOwner','telesalesStatus','telesalesQueuedAt','telesalesHandoffNote','nextFollowUp']));
    }
    return w;
  }
  if (['create','update','delete'].includes(command.action)) {
    check(c !== 'changes', 'Tính năng phát sinh đã được gỡ bỏ; dữ liệu cũ chỉ được lưu trữ.');
    check(c && collections.includes(c), 'Loại dữ liệu không hợp lệ.');
    const list = rows(w,c);
    if (command.action === 'create') {
      check(list.length < 10000, 'Đã đạt giới hạn bản ghi của không gian này.');
      const r: Row = {id:crypto.randomUUID(),...defaults(c,now),...pick(c,d)};
      if (c === 'projects') { check(r.status !== 'Hoàn tất', 'Hãy nghiệm thu để hoàn tất dự án.'); r.originalDueDate=r.dueDate; }
      if (c === 'deals') {
        check(r.stage !== 'Đã chốt', 'Hãy dùng thao tác Chốt cơ hội để tạo dự án.');
        if(own(r,'probability'))number(r.probability,'Xác suất',100);
        r.probability=r.stage==='Không thành công'?0:(r.probability??DEAL_PROBABILITIES[String(r.stage)]??10);
        r.createdAt=now;r.createdBy=actor;r.stageChangedAt=now;r.stageHistory=[{stage:r.stage,at:now,actor}];
      }
      if (['tasks','contents','issues'].includes(c)) project(w,r.projectId,true);
      if (c === 'customers') { normalizeCustomerInput(w,r); checkCustomerDuplicates(w,r,undefined); }
      validate(w,c,r); list.push(r); log(w,actor,now,`Tạo ${recordLabel(r)}`,'create',r.id); return w;
    }
    const r = find(list,id,'Bản ghi');
    if (command.action === 'delete') {
      check(!referenced(w,c,r), 'Bản ghi đang được sử dụng; hãy xử lý các liên kết trước.');
      check(!(c === 'deals' && r.projectId), 'Không thể xóa cơ hội đã tạo dự án.');
      check(!(c === 'contents' && r.status === 'Đã đăng'), 'Không thể xóa nội dung đã đăng.');
      check(!(c === 'contents' && r.approvedAt), 'Không thể xóa nội dung có bằng chứng xác nhận đã lưu.');
      check(!(c === 'contents' && Array.isArray(r.history) && r.history.some((entry:Record<string,unknown>)=>entry.approvedAt)), 'Không thể xóa nội dung có lịch sử đã được duyệt.');
      list.splice(list.indexOf(r),1); log(w,actor,now,`Xóa ${recordLabel(r)}`,'delete',r.id); return w;
    }
    const update = pick(c,d);
    const before = structuredClone(r);
    if (c === 'deals') {
      check(r.stage !== 'Đã chốt', 'Cơ hội đã chốt; hãy quản lý thay đổi trong dự án.');check(update.stage !== 'Đã chốt', 'Hãy dùng thao tác Chốt cơ hội để tạo dự án.');
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
      const contentChanged = ['body','title','url'].some(key=>own(update,key) && update[key]!==r[key]);
      if (contentChanged) {
        const history = (r.history as Record<string,unknown>[] | undefined) || [];
        history.push({version:r.version,title:r.title,body:r.body,url:r.url,approvedAt:r.approvedAt,approvedBy:r.approvedBy,confirmation:r.approvalConfirmation});
        r.history=history; r.version=Number(r.version)+1;
        delete r.approvedAt; delete r.approvedBy; delete r.approvedVersion; delete r.approvalConfirmation;
        update.status='Đang sản xuất';
      }
    }
    Object.assign(r,update);
    if (c === 'customers') { normalizeCustomerInput(w,r); checkCustomerDuplicates(w,r,before); r.updatedAt=now; }
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
    log(w,actor,now,'Cập nhật cài đặt công ty','settings'); return w;
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
    for(const customer of targets)check(safePhone(customer.phone),`${customer.name} chưa có số điện thoại hợp lệ để chuyển telesales.`);
    for(const customer of targets) {
      const previous=structuredClone(customer) as unknown as Row;
      customer.telesalesOwner=nextOwner;customer.telesalesStatus='Chờ gọi';customer.telesalesQueuedAt=now;customer.telesalesHandoffNote=str(d.note);customer.updatedAt=now;
      if(own(d,'nextFollowUp'))customer.nextFollowUp=str(d.nextFollowUp);
      const previousOwner=previous.telesalesOwner?ownerName(w,String(previous.telesalesOwner)):'chưa phân công';
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
    check(nextOwner!==customer.owner,'Người nhận đang phụ trách khách hàng này.');const previous=customer.owner;
    customer.owner=nextOwner;customer.updatedAt=now;
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
      const previous=structuredClone(customer) as unknown as Row;Object.assign(customer,update);customer.updatedAt=now;
      const details=diff(previous,customer as unknown as Row,Object.keys(update));
      let message=`Cập nhật nhóm: ${customer.name}`;
      if(own(update,'owner') && previous.owner!==customer.owner)message+=` · ${ownerName(w,String(previous.owner))} → ${ownerName(w,customer.owner)}`;
      log(w,actor,now,message,'bulk_update_customers',customer.id,details);
    }
    return w;
  }
  if (command.action === 'win_deal') {
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
  if (command.action === 'complete_project') {
    const p=project(w,id,true);checkComplete(w,p);text(d.acceptance,'Bằng chứng nghiệm thu');p.acceptance=str(d.acceptance);p.status='Hoàn tất';log(w,actor,now,`Nghiệm thu và hoàn tất ${p.name}`,'complete_project',p.id);return w;
  }
  throw new CRMError('Thao tác không được hỗ trợ.');
}
