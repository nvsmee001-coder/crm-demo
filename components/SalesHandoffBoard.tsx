'use client';

import { useState, type FormEvent } from 'react';
import type { Command, Customer, CRMResponse, SalesHandoffRow } from '../lib/crm-types';
import type { EmployeeMutation } from './ProspectEditor';
import styles from './SalesWorkflow.module.css';

export const handoffToday = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
const dateLabel = (date:string) => date.split('-').reverse().join('/');
const outcomes = {accepted:'Đã tiếp nhận',returned:'Đã trả lại',cancelled:'Đã hủy'};

export function RequestSalesHandoff({customer, candidates, revision, busy, onMutate, onClose}: {
  customer:Customer; candidates:NonNullable<CRMResponse['salesAssignees']>; revision:number; busy:boolean;
  onMutate:EmployeeMutation; onClose:()=>void;
}) {
  const [openedRevision] = useState(revision);
  const [error,setError] = useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const recipientId = values.get('recipientId'), dueDate = values.get('dueDate'), summary = values.get('summary');
    setError('');
    const saved = await onMutate({action:'request_sales_handoff',id:customer.id,data:{recipientId,dueDate,summary}},
      {expectedRevision:openedRevision,onError:setError});
    if (saved) onClose();
  }

  return <form className={styles.form} aria-label="Gửi khách sang Sale" onSubmit={submit}>
    <label>Sale nhận khách<select name="recipientId" defaultValue="" required>
      <option value="">Chọn Sale/Account</option>{candidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
    </select></label>
    <label>Hạn tiếp nhận<input type="date" name="dueDate" required min={handoffToday()} defaultValue={handoffToday()}/></label>
    <label>Nhu cầu và việc tiếp theo<textarea name="summary" rows={4} required maxLength={3000} defaultValue={customer.salesHandoff?.summary ?? customer.nextAction}/></label>
    {!candidates.length && <p>Cần một tài khoản Sale/Account đã kích hoạt để chọn người nhận.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button type="button" className="btn" disabled={busy} onClick={onClose}>Đóng</button>
      <button type="submit" className="btn primary" disabled={busy || !candidates.length}>Gửi đề nghị</button></div>
  </form>;
}

export default function SalesHandoffBoard({items, role, revision, busy, visibleCustomers, candidates, onMutate, onOpenCustomer}: {
  items:SalesHandoffRow[]; role:'telesales'|'account'|'management'; revision:number; busy:boolean;
  visibleCustomers:Customer[]; candidates?:CRMResponse['salesAssignees']; onMutate:EmployeeMutation; onOpenCustomer:(id:string)=>void;
}) {
  const [history,setHistory] = useState(false);
  const [editing,setEditing] = useState<{id:string;revision:number} | null>(null);
  const [error,setError] = useState<{id:string;message:string} | null>(null);
  const today = handoffToday();
  const pending = items.filter(item=>!item.resolution);
  const overdue = pending.filter(item=>item.dueDate < today).length;
  const shown = history ? items.filter(item=>item.resolution) : pending;
  const visibleIds = new Set(visibleCustomers.map(customer=>customer.id));
  const candidateIds = candidates && new Set(candidates.map(candidate=>candidate.id));
  const account = role === 'account';

  async function resolve(item:SalesHandoffRow, decision:'accepted'|'returned'|'cancelled', reason='', expectedRevision=revision) {
    const command:Omit<Command,'expectedRevision'> = {action:decision === 'cancelled' ? 'cancel_sales_handoff' : 'respond_sales_handoff',
      id:item.customerId,data:{handoffId:item.id,decision,reason}};
    setError(null);
    if (await onMutate(command,{expectedRevision,onError:message=>setError({id:item.id,message}),
      onSuccess:decision === 'accepted' ? ()=>onOpenCustomer(item.customerId) : undefined})) setEditing(null);
  }

  return <section className={styles.workflow} aria-label="Hàng chờ bàn giao sang Sale">
    <header className={styles.heading}><h2>{account ? 'Khách chờ tiếp nhận' : 'Bàn giao sang Sale'}</h2>
      {overdue > 0 && <span className={styles.error}>{overdue} quá hạn</span>}
    </header>
    <div className={styles.actions} role="group" aria-label="Lọc bàn giao">
      <button className={`btn ${!history ? 'primary' : ''}`} aria-pressed={!history} onClick={()=>{setHistory(false);setEditing(null);}}>Chờ nhận · {pending.length}</button>
      <button className={`btn ${history ? 'primary' : ''}`} aria-pressed={history} onClick={()=>{setHistory(true);setEditing(null);}}>Đã xử lý · {items.length - pending.length}</button>
    </div>
    {!shown.length && <p>{history ? 'Chưa có đề nghị gần nhất đã xử lý.' : 'Chưa có đề nghị đang chờ.'}</p>}
    <ul className={styles.rows}>{shown.map(item=>{
      const late = !item.resolution && item.dueDate < today;
      const reasonLabel = account ? 'Lý do trả lại' : 'Lý do hủy đề nghị';
      return <li key={item.id} className={styles.handoffRow}>
        <div><strong>{item.customerName}</strong><small>{item.fromName} → {item.toName} · Hạn {dateLabel(item.dueDate)}</small>
          {item.resolution ? <small>{outcomes[item.resolution.decision]} · {item.resolution.name}{item.resolution.reason && ` · ${item.resolution.reason}`}</small> :
            <small className={late ? styles.error : undefined}>{late ? 'Quá hạn tiếp nhận' : 'Chờ Sale nhận'}</small>}
          <p>{item.summary}</p>
          {!item.resolution && candidateIds && !candidateIds.has(item.toMemberId) && <small className={styles.error}>Tài khoản nhận hiện không khả dụng.</small>}
        </div>
        <div className={styles.actions}>
          {!item.resolution && account && <button className="btn primary" disabled={busy || editing?.id === item.id} onClick={()=>void resolve(item,'accepted')}>Nhận khách</button>}
          {!item.resolution && <button className="btn" disabled={busy || editing?.id === item.id} onClick={()=>{setEditing({id:item.id,revision});setError(null);}}>{account ? 'Trả lại' : 'Hủy đề nghị'}</button>}
          {visibleIds.has(item.customerId) && <button className="btn" onClick={()=>onOpenCustomer(item.customerId)}>Mở hồ sơ</button>}
        </div>
        {error?.id === item.id && <p className={styles.error} role="alert">{error.message}</p>}
        {editing?.id === item.id && !item.resolution && <form className={styles.form} aria-label={reasonLabel} onSubmit={event=>{
          event.preventDefault();
          const reason=String(new FormData(event.currentTarget).get('reason') ?? '');
          void resolve(item,account ? 'returned' : 'cancelled',reason,editing.revision);
        }}>
          <label>{reasonLabel}<textarea name="reason" required maxLength={3000} rows={3}/></label>
          <div className={styles.actions}><button type="button" className="btn" disabled={busy} onClick={()=>setEditing(null)}>Đóng</button>
            <button type="submit" className="btn primary" disabled={busy}>{account ? 'Xác nhận trả lại' : 'Xác nhận hủy'}</button></div>
        </form>}
      </li>;
    })}</ul>
  </section>;
}
