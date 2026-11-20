'use client';
import { useState, type FormEvent } from 'react';

export default function LoginForm() {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [needsCode,setNeedsCode]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:form.get('email'),password:form.get('password'),code:form.get('code'),
          returnTo:new URLSearchParams(window.location.search).get('returnTo')||'/'})});
      const body=await response.json();
      if (body.mfaRequired) { setNeedsCode(true); return; }
      if (!response.ok) throw new Error(body.error||'Chưa đăng nhập được.');
      window.location.assign(body.returnTo||'/');
    } catch (reason) {
      setError(reason instanceof Error?reason.message:'Chưa đăng nhập được.');
    } finally {
      setBusy(false);
    }
  }

  return <><form className="auth-form" onSubmit={submit}>
    {error&&<div className="auth-error" role="alert">{error}</div>}
    <label className="auth-field"><span>Email</span><input type="email" name="email" autoComplete="username" maxLength={254} required autoFocus disabled={busy}/></label>
    <label className="auth-field"><span>Mật khẩu</span><input type="password" name="password" autoComplete="current-password" maxLength={128} required disabled={busy}/></label>
    {needsCode&&<label className="auth-field"><span>Mã xác thực hoặc mã khôi phục</span>
      <input name="code" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} maxLength={32} required autoFocus disabled={busy}/>
    </label>}
    <button className="auth-submit" disabled={busy}>{busy?'Đang đăng nhập…':'Đăng nhập CRM'}</button>
  </form><p className="auth-footer">Chưa có tài khoản hoặc quên mật khẩu? Liên hệ quản trị viên công ty để nhận liên kết đặt mật khẩu mới.</p></>;
}
