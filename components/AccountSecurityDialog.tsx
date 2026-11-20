'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { AccessAccount } from '../lib/crm-types';
import { handoverSections, type HandoverPreview, type HandoverRecipient, type HandoverSection } from '../lib/offboarding-types';

type Props = {
  account:AccessAccount;
  name:string;
  mode:'offboard'|'reset';
  onClose:()=>void;
  onSaved:(message:string)=>void;
};

const groups=Object.keys(handoverSections) as HandoverSection[];
const roleNames={owner:'Chủ sở hữu',manager:'Quản lý',account:'Sale / Account',delivery:'Triển khai',telesales:'Telesales',finance:'Tài chính'};

export default function AccountSecurityDialog({account,name,mode,onClose,onSaved}:Props) {
  const modal=useRef<HTMLDialogElement>(null);
  const [preview,setPreview]=useState<HandoverPreview|null>(null);
  const [selected,setSelected]=useState<Partial<Record<HandoverRecipient,string>>>({});
  const [loading,setLoading]=useState(mode==='offboard');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [stale,setStale]=useState(false);
  const reset=mode==='reset';

  async function loadPreview(signal?:AbortSignal) {
    setError('');setStale(false);setLoading(true);setPreview(null);setSelected({});
    try {
      const response=await fetch('/api/admin/offboarding?accountId='+encodeURIComponent(account.id),{cache:'no-store',signal});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error);
      setPreview(result);
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error?reason.message:'Chưa tải được công việc.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(()=>{
    modal.current?.showModal();
    const controller=new AbortController();
    if (mode==='offboard') void loadPreview(controller.signal);
    return ()=>controller.abort();
  },[account.id,mode]);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command=(event.nativeEvent as SubmitEvent).submitter;
    const action=command instanceof HTMLButtonElement ? command.value : '';
    if (!reset && (!preview || !['lock','transfer'].includes(action))) return;
    const data=new FormData(event.currentTarget);
    setError('');setBusy(true);
    try {
      const response=await fetch(reset?'/api/admin/mfa-reset':'/api/admin/offboarding',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({accountId:account.id,action,password:data.get('password'),reason:data.get('reason'),
          accessRevision:preview?.accessRevision,workspaceRevision:preview?.workspaceRevision,recipients:selected})});
      const result=await response.json();
      if (!response.ok) {
        if (response.status===409 && !reset) setStale(true);
        throw new Error(result.error);
      }
      onSaved(reset?'Đã thu hồi thiết bị xác thực. Nhân viên sẽ thiết lập lại sau khi đăng nhập.':
        result.transferred?`Đã bàn giao ${result.transferred} mục và khóa tài khoản.`:'Đã khóa tài khoản và thu hồi phiên đăng nhập.');
    } catch (reason) { setError(reason instanceof Error?reason.message:'Chưa hoàn tất thao tác.'); }
    finally { setBusy(false); }
  }

  const withWork=groups.filter(group=>preview && preview.work[group].count>0);
  const ready=withWork.length>0 && withWork.every(group=>group==='handoffs'||!!selected[group]);
  return <dialog className="access-editor account-security-dialog" ref={modal} aria-labelledby="account-security-title"
    onCancel={event=>{event.preventDefault();if(!busy) onClose();}}>
    <header>
      <div><h2 id="account-security-title">{reset?'Cấp lại thiết bị xác thực':'Khóa tài khoản và bàn giao'}</h2><p>{name} · {account.email}</p></div>
      <button className="icon-button" type="button" aria-label="Đóng" disabled={busy} onClick={onClose}><X size={17}/></button>
    </header>
    <form onSubmit={submit}>
      <div className="access-editor-body">
        {error&&<p className="access-error" role="alert">{error}</p>}
        {loading&&<p role="status">Đang rà soát công việc…</p>}
        {!reset&&!loading&&(!preview||stale)&&<button type="button" className="btn" onClick={()=>void loadPreview()}>Tải lại bản xem trước</button>}
        {reset&&<p>Thao tác này thu hồi thiết bị, mã khôi phục và các phiên đăng nhập của nhân viên. Họ sẽ đăng nhập bằng mật khẩu hiện tại để thiết lập thiết bị mới.</p>}
        {preview&&<>
          <p>{withWork.length?'Kiểm tra các mục bên dưới và chọn người nhận. Hồ sơ đã hoàn tất vẫn lưu người phụ trách cũ.':'Tài khoản không có việc tồn cần bàn giao.'}</p>
          {!preview.active&&<p>Tài khoản đã bị khóa.</p>}
          {withWork.map(group=>{
            const {count,examples}=preview.work[group];
            return <section className="account-handover-section" key={group}>
              <details>
                <summary>{handoverSections[group]} ({count})</summary>
                <ul>{examples.map((label,index)=><li key={index}>{label}</li>)}</ul>
                {count>examples.length&&<small>Và {count-examples.length} mục khác.</small>}
              </details>
              {group!=='handoffs'&&(preview.choices[group].length?
                <label className="access-field"><span>Người nhận {handoverSections[group].toLowerCase()}</span>
                  <select value={selected[group]||''} onChange={event=>setSelected({...selected,[group]:event.target.value})} disabled={busy}>
                    <option value="">Chọn người nhận</option>
                    {preview.choices[group].map(choice=><option key={choice.id} value={choice.id}>{choice.name} · {roleNames[choice.role]}</option>)}
                  </select>
                </label>:<p>Chưa có tài khoản hoạt động đủ quyền để nhận nhóm này.</p>)}
            </section>;
          })}
          {preview.active&&withWork.length>0&&<p className="access-form-note">Bạn có thể khóa ngay và quay lại bàn giao sau.</p>}
          {(preview.active||withWork.length>0)&&<label className="access-field"><span>Lý do</span><input required name="reason" maxLength={500} disabled={busy}/></label>}
        </>}
        {(reset || (preview && (preview.active || withWork.length>0)))&&<label className="access-field">
          <span>Mật khẩu hiện tại của bạn</span>
          <input name="password" type="password" required autoComplete="current-password" maxLength={128} disabled={busy}/>
        </label>}
      </div>
      <footer>
        <button className="btn" type="button" disabled={busy} onClick={onClose}>Đóng</button>
        {reset&&<button className="btn danger" type="submit" disabled={busy}>Xác nhận cấp lại MFA</button>}
        {preview?.active&&<button className="btn danger" value="lock" type="submit" disabled={busy||stale}>{withWork.length?'Chỉ khóa ngay':'Khóa tài khoản'}</button>}
        {withWork.length>0&&<button className="btn primary" value="transfer" type="submit" disabled={busy||stale||!ready}>{preview?.active?'Bàn giao và khóa':'Bàn giao công việc'}</button>}
      </footer>
    </form>
  </dialog>;
}
