'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import BrandLogo from './BrandLogo';
import LogoutButton from './LogoutButton';
import { CollectionsWorkspace } from './CollectionsWorkspace';
import type { Command } from '../lib/crm-types';
import type { FinanceDashboard } from '../lib/finance-types';

export default function FinanceWorkspace() {
  const [dashboard,setDashboard] = useState<FinanceDashboard|null>(null);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const sequence = useRef(0);
  const writing = useRef(false);
  const retry = useRef<{key:string;id:string}|null>(null);
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());

  async function load(signal?:AbortSignal) {
    const version = ++sequence.current;
    setLoading(true);
    try {
      const response = await fetch('/api/finance',{cache:'no-store',signal});
      const body = await response.json();
      if (signal?.aborted || version !== sequence.current) return;
      if (!response.ok) {
        if (response.status===401 || response.status===403) setDashboard(null);
        throw Error(body.error || 'Chưa tải được sổ thu tiền.');
      }
      setDashboard(body);
      setError('');
    } catch(error) {
      if (!signal?.aborted && version === sequence.current) setError(error instanceof Error ? error.message : 'Chưa tải được sổ thu tiền.');
    } finally { if (!signal?.aborted && version === sequence.current) setLoading(false); }
  }

  useEffect(()=>{
    const controller = new AbortController();
    void load(controller.signal);
    const interval = setInterval(()=>{if(!writing.current && document.visibilityState==='visible')void load(controller.signal);},30_000);
    return ()=>{clearInterval(interval);controller.abort();};
  },[]);

  async function mutate(command:Omit<Command,'expectedRevision'>, options?:{expectedRevision?:number;onError?:(message:string)=>void}) {
    if (!dashboard || writing.current) return false;
    writing.current = true;
    setBusy(true);
    setNotice('');
    try {
      const payload = {...command,expectedRevision:options?.expectedRevision ?? dashboard.revision};
      const key = JSON.stringify(payload);
      if (retry.current?.key !== key) retry.current = {key,id:crypto.randomUUID()};
      const response = await fetch('/api/finance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,requestId:retry.current.id})});
      const body = await response.json();
      if (response.ok || response.status < 500) retry.current = null;
      if (!response.ok) {
        if ([401,403,409].includes(response.status)) await load();
        if (response.status===409) throw Error('Sổ vừa có thay đổi. Đối chiếu số dư rồi mở lại biểu mẫu để lưu.');
        throw Error(body.error || 'Chưa lưu được thay đổi.');
      }
      ++sequence.current;
      setLoading(false);
      setDashboard(body);
      setNotice('Đã lưu thay đổi.');
      return true;
    } catch(error) {
      options?.onError?.(error instanceof Error ? error.message : 'Chưa lưu được thay đổi.');
      return false;
    } finally { writing.current=false;setBusy(false); }
  }

  return <div className="employee-shell">
    <header className="employee-topbar"><div className="employee-brand smee-employee-brand"><BrandLogo/></div>
      <div className="employee-user">{dashboard&&<div><strong>{dashboard.viewer.name}</strong><small>{dashboard.viewer.email}</small></div>}
        <a className="btn" href="/account/password">Đổi mật khẩu</a><LogoutButton className="btn">Đăng xuất</LogoutButton>
      </div>
    </header>
    <main className="employee-container finance-main">
      <div className="col-buttons"><h1>Thu tiền &amp; công nợ</h1><button className="btn" disabled={busy||loading} onClick={()=>void load()}><RefreshCw size={15}/>Tải lại</button></div>
      {notice&&<p role="status">{notice}</p>}{error&&<p className="col-error" role="alert">{error}</p>}
      {loading&&!dashboard&&<p role="status">Đang tải sổ thu…</p>}
      {dashboard&&<CollectionsWorkspace data={dashboard.data} today={today} revision={dashboard.revision} busy={busy} role="finance" mode="live" onMutate={mutate}/>}
    </main>
  </div>;
}
