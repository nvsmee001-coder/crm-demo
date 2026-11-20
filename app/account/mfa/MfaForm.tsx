'use client';

import { useState, type FormEvent } from 'react';

export default function MfaForm({email,setupOnly,enabled,available}:{email:string;setupOnly:boolean;enabled:boolean;available:boolean}) {
  const [secret,setSecret]=useState('');
  const [codes,setCodes]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const confirming=!!secret;
    setBusy(true);
    setError('');
    try {
      const body=confirming?{action:'confirm',code:form.get('code')}:{action:'begin',password:form.get('password')};
      const response=await fetch('/api/auth/mfa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error);
      if (confirming) { setSecret(''); setCodes(result.codes); }
      else setSecret(result.secret);
    } catch (reason) { setError(reason instanceof Error?reason.message:'Chưa lưu được thiết lập.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    try {
      const response=await fetch('/api/auth/logout',{method:'POST'});
      if (!response.ok) throw new Error();
      window.location.assign('/login');
    } catch { setError('Chưa đăng xuất được. Vui lòng thử lại.'); }
  }

  if (codes.length) return <div className="auth-form">
    <p>Lưu các mã khôi phục này ở nơi an toàn. Mỗi mã dùng một lần và chỉ xuất hiện tại đây.</p>
    <ul>{codes.map(code=><li key={code}><code>{code}</code></li>)}</ul>
    <a href="/">Đã lưu mã, vào CRM</a>
  </div>;

  return <div className="auth-form">
    {error&&<p className="auth-error" role="alert">{error}</p>}
    {!available&&<p>Máy chủ cần được cấu hình khóa MFA. Hãy liên hệ người vận hành.</p>}
    {available&&<form className="auth-form" onSubmit={submit} key={secret?'confirm':'begin'}>
      {secret?<><p>Trong ứng dụng xác thực, thêm tài khoản bằng khóa thiết lập. Đặt tên <strong>{email}</strong> và chọn mã theo thời gian.</p>
        <label className="auth-field"><span>Khóa thiết lập</span><input readOnly value={secret} onFocus={event=>event.currentTarget.select()} /></label>
        <label className="auth-field"><span>Mã 6 chữ số</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required autoFocus disabled={busy}/></label>
        <button className="auth-submit" disabled={busy}>Xác nhận và cấp mã khôi phục</button>
        <button type="button" disabled={busy} onClick={()=>{setSecret('');setError('');}}>Bắt đầu lại</button>
      </>:<>
        {enabled&&<p>Khi xác nhận thiết bị mới, thiết bị cũ, mã khôi phục cũ và các phiên đăng nhập cũ sẽ hết hiệu lực.</p>}
        <label className="auth-field"><span>Mật khẩu hiện tại</span><input name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy}/></label>
        <button className="auth-submit" disabled={busy}>{enabled?'Đổi thiết bị và mã khôi phục':'Bắt đầu thiết lập'}</button>
      </>}
    </form>}
    {setupOnly?<button type="button" onClick={logout}>Đăng xuất</button>:<a href="/">Quay lại CRM</a>}
  </div>;
}
