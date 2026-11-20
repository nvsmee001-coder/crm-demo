'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Copy, KeyRound, LockKeyhole, Pencil, Plus, RefreshCw, Shield, ShieldCheck, Users, X } from 'lucide-react';
import type { AccessAccount, AccessResponse, AccessRole as AllAccessRole, TeamMember, Workspace } from '../lib/crm-types';
import type { AdminDashboard } from '../lib/admin-types';
import AccountSecurityDialog from './AccountSecurityDialog';

type AccessRole=Exclude<AllAccessRole,'owner'>;
type Props = {
  data?: Pick<Workspace, 'settings'>;
  initialDashboard?: AdminDashboard;
  onDashboard?: (dashboard: AdminDashboard) => void;
  onNotify: (text: string, error?: boolean) => void;
  onChanged?: () => void;
};
const NEW_MEMBER = '__new_member__';
const ROLE_NAMES:Record<AccessRole,string>={telesales:'Telesales',account:'Sale / Account',delivery:'Triển khai',finance:'Tài chính',manager:'Quản lý'};
const STAFF_ROLES:AccessRole[]=['telesales','account','delivery','finance','manager'];
const ROLE_DESCRIPTIONS:Record<AccessRole,string>={telesales:'Thêm khách tự khai thác vào danh sách gọi của mình, cập nhật hồ sơ và ghi kết quả cuộc gọi.',account:'Thêm khách tự khai thác, cập nhật hồ sơ và lịch chăm sóc cho khách mình phụ trách.',delivery:'Xem các dự án được giao và xử lý công việc, nội dung, vướng mắc thuộc phạm vi của mình.',finance:'Xem sổ của hợp đồng đã xác nhận, ghi phiếu thu và đề nghị điều chỉnh để Chủ sở hữu xử lý.',manager:'Quản lý dữ liệu nghiệp vụ và vận hành. Chủ sở hữu cấp quyền tài khoản.'};
const dateText=(value:string)=>value?new Date(value).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có';
export default function AccessSettings({data,initialDashboard,onDashboard,onNotify,onChanged}:Props){
 const [access,setAccess]=useState<AccessResponse|null>(initialDashboard?.access || null),[team,setTeam]=useState<TeamMember[]>(initialDashboard?.team || []),[loading,setLoading]=useState(!initialDashboard),[saving,setSaving]=useState(false),[error,setError]=useState(''),[teamError,setTeamError]=useState(''),[editor,setEditor]=useState<AccessAccount|'new'|null>(null),[form,setForm]=useState({email:'',teamMemberId:'',role:'telesales' as AccessRole,active:true}),[formError,setFormError]=useState(''),[signInLink,setSignInLink]=useState(''),[activation,setActivation]=useState<{email:string;url:string}|null>(null),[linkBusy,setLinkBusy]=useState('');
 const [newMember,setNewMember]=useState({name:'',jobTitle:''});
 const [mfa,setMfa]=useState(initialDashboard?.mfa);
 const [security,setSecurity]=useState<{account:AccessAccount;mode:'offboard'|'reset'}|null>(null);
 const editorRevision=useRef<number|undefined>(undefined);
 const modalRef=useRef<HTMLDivElement>(null),savingRef=useRef(false);
 savingRef.current=saving;
 const [search, setSearch] = useState('');
 const [status, setStatus] = useState('all');
 async function load() {
   setLoading(true);
   setError('');
   setTeamError('');
   try {
     const response = await fetch('/api/admin', { cache: 'no-store' });
     if (!response.ok) throw new Error((await response.json()).error || 'Không tải được dữ liệu quản trị.');
     const dashboard: AdminDashboard = await response.json();
     setAccess(dashboard.access);
     setTeam(dashboard.team);
     setMfa(dashboard.mfa);
     onDashboard?.(dashboard);
   } catch (reason) {
     const message = reason instanceof Error ? reason.message : 'Không tải được dữ liệu quản trị.';
     setError(message);
     setTeamError(message);
   } finally {
     setLoading(false);
   }
 }
 useEffect(() => {
   if (!initialDashboard) void load();
   setSignInLink(window.location.origin + '/login');
 }, []);
 useEffect(()=>{if(!editor)return;const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';modalRef.current?.querySelector<HTMLElement>('input:not([readonly]),select,button')?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();if(!savingRef.current)setEditor(null)}if(event.key!=='Tab')return;const elements=Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')||[]);if(!elements.length)return;const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}};document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus()}},[!!editor]);
 const memberName=(id:string)=>team.find(member=>member.id===id)?.name||'Nhân sự chưa có trong danh bạ công ty';
 function normalize(value: string) {
   return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
 }
 const accounts = access?.accounts || [];
 const selectableMembers = team.filter(member => {
   if (editor && editor !== 'new' && editor.teamMemberId === member.id) return true;
   return member.id !== 'member-admin' && !accounts.some(account => account.teamMemberId === member.id);
 });
 const matching = accounts.filter(account => {
   const text = normalize([account.email, memberName(account.teamMemberId), ROLE_NAMES[account.role]].join(' '));
   const visible = status === 'all' || (status === 'active' && account.active)
     || (status === 'locked' && !account.active) || (status === 'pending' && account.active && !account.bound);
   return visible && text.includes(normalize(search.trim()));
 });
 function openEditor(account?:AccessAccount){setNewMember({name:'',jobTitle:''});editorRevision.current=access?.revision;setFormError('');setEditor(account||'new');setForm(account?{email:account.email,teamMemberId:account.teamMemberId,role:account.role,active:account.active}:{email:'',teamMemberId:NEW_MEMBER,role:'telesales',active:true})}
 async function mutate(payload:Record<string,unknown>, expectedRevision=access?.revision){if(!access||saving||loading)return false;if(!Number.isInteger(expectedRevision)){onNotify('Chưa có phiên bản quyền truy cập. Tải lại trước khi lưu.',true);return false}setSaving(true);setFormError('');try{const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,expectedRevision})});const body:any=await response.json();if(!response.ok){if(response.status===409){await load();throw new Error('Danh sách tài khoản vừa thay đổi. Giữ lại thông tin đang nhập, sau đó mở lại biểu mẫu để kiểm tra trước khi lưu.')}throw new Error(body.error||'Không lưu được quyền truy cập')}setAccess(body);setActivation(null);await load();onNotify(payload.action==='upsert'&&!payload.id?'Đã tạo người dùng. Bấm Đặt mật khẩu để lấy liên kết kích hoạt.':'Đã lưu quyền truy cập CRM');onChanged?.();return true}catch(reason){const message=reason instanceof Error?reason.message:'Không lưu được quyền truy cập';setFormError(message);onNotify(message,true);return false}finally{setSaving(false)}}
 async function submit(event: FormEvent) {
   event.preventDefault();
   if (!form.email.trim() || !form.teamMemberId) {
     setFormError('Chọn nhân sự và nhập email đăng nhập.');
     return;
   }
   const creatingMember = editor === 'new' && form.teamMemberId === NEW_MEMBER;
   const ok = await mutate({
     action:'upsert',
     ...(editor && editor!=='new' ? {id:editor.id} : {}),
     ...(creatingMember ? {newMember} : {teamMemberId:form.teamMemberId}),
     email:form.email.trim().toLowerCase(),role:form.role,active:form.active,
   }, editorRevision.current);
   if (ok) setEditor(null);
 }
 async function createLink(account:AccessAccount){if(linkBusy||saving)return;setLinkBusy(account.id);setActivation(null);try{const response=await fetch('/api/auth/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:account.id})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Chưa tạo được liên kết.');setActivation({email:account.email,url:body.url});await load();onNotify('Đã tạo liên kết đặt mật khẩu, hiệu lực 1 giờ.')}catch(reason){onNotify(reason instanceof Error?reason.message:'Chưa tạo được liên kết.',true)}finally{setLinkBusy('')}}
 async function copyActivation(){if(!activation)return;try{await navigator.clipboard.writeText(activation.url);onNotify('Đã sao chép liên kết đặt mật khẩu')}catch{onNotify('Chọn liên kết để sao chép thủ công.',true)}}
 async function copyLink(){try{await navigator.clipboard.writeText(signInLink);onNotify('Đã sao chép liên kết đăng nhập')}catch{onNotify('Chọn liên kết trong ô để sao chép thủ công.',true)}}
 if(loading&&!access)return <section className="access-panel"><div className="access-loading"><RefreshCw size={20}/><p>Đang tải quyền truy cập và nhân sự công ty…</p></div></section>;
 if(!access)return <section className="access-panel"><div className="access-error" role="alert">{error||'Chưa tải được quyền truy cập.'}</div><button className="btn" onClick={()=>load()}><RefreshCw size={14}/>Thử lại</button></section>;
 if(access.viewer.role!=='owner')return <section className="access-panel"><p className="access-muted">Chỉ chủ sở hữu được quản lý tài khoản đăng nhập.</p></section>;
 return <div className="access-settings"><section className="access-panel"><div className="access-heading"><div><h2>Tài khoản và phân quyền</h2><a className="admin-directory-link" href="/?section=team"><Users size={14}/>Quản lý danh bạ nhân sự</a></div><button className="btn primary" disabled={saving||loading||!!teamError} onClick={()=>openEditor()}><Plus size={14}/>Thêm người dùng</button></div>{error&&<p className="access-error" role="alert">{error}</p>}{teamError&&<p className="access-error" role="alert">{teamError}. Cần tải được danh bạ <strong>dữ liệu công ty</strong> để cấp quyền đúng người.</p>}<div className="access-owner"><span className="access-owner-icon"><ShieldCheck size={21}/></span><div><strong>{access.owner.name||'Chủ sở hữu '+(initialDashboard?.companyName || data?.settings.companyName || 'SMEE')}</strong><span>{access.owner.email}</span><a className="admin-directory-link" href="/account/mfa">{mfa?.ownerEnabled?'Quản lý xác thực hai lớp':'Thiết lập xác thực hai lớp'}</a></div><span className="access-role owner"><LockKeyhole size={11}/>Chủ sở hữu · toàn quyền</span></div>{accounts.length > 0 && <div className="admin-account-filters">
   <label>Tìm tài khoản<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tên, email hoặc vai trò" /></label>
   <label>Trạng thái<select value={status} onChange={event=>setStatus(event.target.value)}>
     <option value="all">Tất cả trạng thái</option><option value="active">Đang cho phép</option>
     <option value="locked">Đã khóa</option><option value="pending">Chờ kích hoạt</option>
   </select></label>
 </div>}<div className="access-table-scroll"><table className="access-table"><thead><tr><th>NHÂN SỰ / EMAIL ĐĂNG NHẬP</th><th>VAI TRÒ</th><th>TRẠNG THÁI</th><th>XÁC THỰC TÀI KHOẢN</th><th/></tr></thead><tbody>{matching.map(account=><tr key={account.id}><td><strong>{memberName(account.teamMemberId)}</strong><small>{account.email}</small></td><td><span className="access-role">{ROLE_NAMES[account.role]}</span></td><td><span className={'access-status '+(account.active?'active':'inactive')}>{account.active?'Đang cho phép':'Đã khóa'}</span></td><td><span className="access-binding">{account.bound?<><CheckCircle2 size={12}/>Đã kích hoạt</>:<><ClockIcon/>Chưa kích hoạt</>}</span><small>Cấp quyền {dateText(account.createdAt)}</small>{account.bound&&mfa?.available&&<small>{mfa.enabledAccountIds.includes(account.id)?'MFA đã bật':mfa.pendingAccountIds.includes(account.id)||(mfa.required&&account.role==='finance')?'MFA chờ thiết lập':'MFA chưa bật'}</small>}</td><td><div className="access-row-actions"><button className="btn small" disabled={saving||loading||!!linkBusy||!account.active} onClick={()=>void createLink(account)}><KeyRound size={12}/>{linkBusy===account.id?'Đang tạo…':'Đặt mật khẩu'}</button><button className="btn small" disabled={saving||loading} onClick={()=>openEditor(account)}><Pencil size={12}/>Sửa</button>{account.active&&mfa?.enabledAccountIds.includes(account.id)&&mfa.available&&<button className="btn small" disabled={saving||loading} onClick={()=>setSecurity({account,mode:'reset'})}>Cấp lại MFA</button>}<button className={'btn small '+(account.active?'danger':'')} disabled={saving||loading} onClick={()=>setSecurity({account,mode:'offboard'})}><LockKeyhole size={12}/> {account.active?'Khóa':'Bàn giao việc'}</button>{!account.active&&<button className="btn small" disabled={saving||loading} onClick={()=>void mutate({action:'set_status',id:account.id,active:true})}><KeyRound size={12}/>Mở khóa</button>}</div></td></tr>)}</tbody></table></div>{accounts.length > 0 && !matching.length && <p className="admin-no-match">Không có tài khoản phù hợp.</p>}{!access.accounts?.length&&<div className="access-empty"><Users size={28}/><h3>Chưa cấp quyền cho nhân viên</h3><p>Bấm Thêm người dùng để tạo nhân sự và cấp quyền đăng nhập.</p></div>}<div className="access-table-footer"><span>{access.accounts?.filter(account=>account.active).length||0} tài khoản đang được cho phép · danh bạ từ dữ liệu công ty</span><button disabled={loading||saving} onClick={()=>load()}><RefreshCw size={12}/>Tải lại</button></div></section>{activation&&<section className="auth-reset-panel" role="status"><h3>Liên kết đặt mật khẩu: {activation.email}</h3><p>Liên kết dùng một lần trong 1 giờ. Gửi riêng cho đúng nhân viên. Khi được sử dụng, mật khẩu cũ và mọi phiên đăng nhập của tài khoản sẽ bị thu hồi. Tạo liên kết mới sẽ thay thế liên kết cũ chưa dùng.</p><input aria-label="Liên kết đặt mật khẩu nhân viên" readOnly value={activation.url} onFocus={event=>event.currentTarget.select()}/><div className="button-row"><button className="btn small" onClick={()=>void copyActivation()}><Copy size={12}/>Sao chép liên kết</button><button className="btn small" onClick={()=>setActivation(null)}>Ẩn liên kết</button></div></section>}<section className="access-activation"><span><Shield size={19}/></span><div><h3>Cấp quyền, rồi tạo liên kết đặt mật khẩu</h3><p>Nhân viên đăng nhập trực tiếp bằng email và mật khẩu CRM. Sau khi lưu tài khoản, bấm Đặt mật khẩu rồi gửi riêng liên kết cho đúng nhân viên. Không có email nào được gửi tự động.</p><label><span>Liên kết đăng nhập để chia sẻ thủ công</span><div><input aria-label="Liên kết đăng nhập CRM" readOnly value={signInLink} onFocus={event=>event.currentTarget.select()}/><button className="btn small" onClick={copyLink}><Copy size={12}/>Sao chép</button></div></label></div></section><section className="access-panel"><div className="access-heading compact"><div><h2>Phạm vi theo vai trò</h2><p>Quyền được kiểm tra trên máy chủ cho từng yêu cầu.</p></div><ShieldCheck size={18}/></div><div className="access-role-grid">{STAFF_ROLES.map(role=><article key={role}><span className="access-role">{ROLE_NAMES[role]}</span><p>{ROLE_DESCRIPTIONS[role]}</p></article>)}</div></section>{security&&<AccountSecurityDialog account={security.account} name={memberName(security.account.teamMemberId)} mode={security.mode} onClose={()=>setSecurity(null)} onSaved={message=>{setSecurity(null);setActivation(null);void load();onNotify(message);onChanged?.();}}/>}{editor&&<div className="access-editor-overlay" onMouseDown={event=>event.target===event.currentTarget&&!saving&&setEditor(null)}><div className="access-editor" role="dialog" aria-modal="true" aria-label={editor==='new'?'Thêm người dùng':'Chỉnh sửa quyền tài khoản'} ref={modalRef}><header><div><span className="access-eyebrow">SMEE / QUYỀN TRUY CẬP</span><h2>{editor==='new'?'Thêm người dùng':'Chỉnh sửa quyền tài khoản'}</h2></div><button className="icon-button" disabled={saving} aria-label="Đóng biểu mẫu tài khoản" onClick={()=>setEditor(null)}><X size={17}/></button></header><form onSubmit={submit}><div className="access-editor-body">{formError&&<p className="access-error" role="alert">{formError}</p>}<label className="access-field"><span>Nhân sự trong dữ liệu công ty *</span><select required value={form.teamMemberId} onChange={event=>{const value=event.target.value;const member=team.find(item=>item.id===value);setForm(previous=>({...previous,teamMemberId:value,email:editor==='new'&&member?.email?member.email:previous.email}))}}><option value="">Chọn nhân sự</option>{editor==='new'&&<option value={NEW_MEMBER}>Tạo nhân sự mới</option>}{selectableMembers.map(member=><option value={member.id} key={member.id}>{member.name} · {member.role}</option>)}</select></label>
 {editor==='new'&&form.teamMemberId===NEW_MEMBER&&<>
   <label className="access-field"><span>Tên nhân sự *</span><input value={newMember.name} onChange={event=>setNewMember({...newMember,name:event.target.value})} required maxLength={100}/></label>
   <label className="access-field"><span>Chức danh công việc *</span><input value={newMember.jobTitle} onChange={event=>setNewMember({...newMember,jobTitle:event.target.value})} required maxLength={100}/></label>
 </>}
 <label className="access-field"><span>Email dùng để đăng nhập *</span><input type="email" required value={form.email} readOnly={editor!=='new'&&editor.bound} onChange={event=>setForm(previous=>({...previous,email:event.target.value}))}/><small>{editor!=='new'&&editor.bound?'Email đã gắn với danh tính đăng nhập nên không thể thay đổi. Nếu đổi người sử dụng, hãy khóa tài khoản cũ rồi tạo nhân sự và tài khoản mới.':'Nhập email của nhân viên; họ sẽ dùng email này để đăng nhập CRM.'}</small></label><label className="access-field"><span>Quyền trong CRM *</span><select value={form.role} onChange={event=>setForm(previous=>({...previous,role:event.target.value as AccessRole}))}>{STAFF_ROLES.map(role=><option key={role} value={role}>{ROLE_NAMES[role]}</option>)}</select><small>{ROLE_DESCRIPTIONS[form.role]}</small></label>{editor==='new'&&<label className="access-checkbox"><input type="checkbox" checked={form.active} onChange={event=>setForm(previous=>({...previous,active:event.target.checked}))}/><span>Cho phép tài khoản truy cập CRM</span></label>}<p className="access-form-note">Sau khi lưu, dùng nút Đặt mật khẩu để tạo liên kết kích hoạt hoặc đặt lại mật khẩu. Không có email nào được gửi tự động.</p></div><footer><button className="btn" type="button" disabled={saving} onClick={()=>setEditor(null)}>Hủy</button><button className="btn primary" type="submit" disabled={saving||!!teamError}><Check size={14}/>{saving?'Đang lưu…':editor==='new'?'Tạo người dùng':'Lưu quyền truy cập'}</button></footer></form></div></div>}</div>;
}
function ClockIcon(){return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>}
