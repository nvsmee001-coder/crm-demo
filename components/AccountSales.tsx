'use client';

import { useState, type FormEvent } from 'react';
import { QUOTE_STAGES, STAGES, type Customer, type Deal, type Workspace } from '../lib/crm-types';
import type { EmployeeMutation } from './ProspectEditor';
import SalesDealWorkflow from './SalesDealWorkflow';
import styles from './SalesWorkflow.module.css';

const dateToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());

export default function AccountSales({customer, data, memberId, revision, busy, onMutate}: {
  customer:Customer; data:Workspace; memberId:string; revision:number; busy:boolean; onMutate:EmployeeMutation;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{deal?:Deal;revision:number} | null>(null);
  const [error, setError] = useState('');
  const deals = data.deals.filter(item=>item.customerId === customer.id);
  const deal = deals.find(item=>item.id === selected);
  const owner = deal && (data.team.find(member=>member.id === deal.owner) ?? data.team.find(member=>member.name === deal.owner));
  const writable = owner?.id === memberId;
  const services = data.services.filter(item=>item.active || item.id === editing?.deal?.serviceId);

  function openEditor(deal?: Deal) {
    setError('');
    setEditing({deal,revision});
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const form = new FormData(event.currentTarget);
    const input = (key: string) => String(form.get(key) ?? '');
    const original = editing.deal;
    const payload = {customerId:customer.id, serviceId:input('serviceId') || original?.serviceId, name:input('name'),
      value:Number(input('value')), closeDate:input('closeDate'), nextAction:input('nextAction'), description:input('description'), stage:input('stage'), lossReason:input('lossReason')};
    const existing = new Set(deals.map(item=>item.id));
    setError('');
    await onMutate({action:original ? 'update' : 'create',collection:'deals',id:original?.id,data:payload},{
      expectedRevision:editing.revision,onError:setError,onSuccess:result=>{
        setEditing(null);
        if (!original) setSelected(result.data.deals.find(item=>item.customerId === customer.id && !existing.has(item.id))?.id ?? null);
      },
    });
  }

  const original = editing?.deal;
  const needsHandoff = customer.telesalesStatus === 'Đủ điều kiện';
  const visibleStages = STAGES.filter(stage=>stage !== 'Đã chốt' && (stage === original?.stage || !QUOTE_STAGES.has(stage) || original?.quotes?.some(quote=>quote.status === 'approved' && quote.validUntil >= dateToday())));
  return <section className={styles.workflow} aria-label="Cơ hội bán hàng của khách hàng">
    <header className={styles.heading}><h3>Cơ hội bán hàng</h3>
      <button type="button" className="btn small" disabled={!services.length || busy || Boolean(editing) || needsHandoff} onClick={()=>openEditor()}>Thêm cơ hội</button>
    </header>
    {!services.length && <p>Quản lý cần mở ít nhất một dịch vụ trước khi lập cơ hội.</p>}
    {needsHandoff && <p>Tiếp nhận khách từ hàng chờ bàn giao trước khi tạo cơ hội.</p>}
    {!deals.length && <p>Chưa có cơ hội cho khách hàng này.</p>}
    <ul className={styles.rows}>{deals.map(item=><li key={item.id}>
      <div><strong>{item.name}</strong><small>{item.stage} · {item.value.toLocaleString('vi-VN')} đ</small></div>
      <button type="button" className="btn small" aria-expanded={item.id === selected} onClick={()=>{setEditing(null);setSelected(item.id === selected ? null : item.id);}}>{item.id === selected ? 'Đóng' : 'Mở cơ hội'}</button>
    </li>)}</ul>
    {deal && !editing && <div className={styles.record}>
      <h4>{deal.name}</h4><p>Dự kiến chốt {deal.closeDate}</p>
      {deal.nextAction && <p>Bước tiếp theo · {deal.nextAction}</p>}
      {deal.description && <p>{deal.description}</p>}
      {writable && deal.stage !== 'Đã chốt' && <div><button type="button" className="btn small" disabled={busy} onClick={()=>openEditor(deal)}>Sửa cơ hội</button></div>}
      {writable && <SalesDealWorkflow key={deal.id} deal={deal} service={data.services.find(item=>item.id === deal.serviceId)} management={false} revision={revision} busy={busy} onMutate={onMutate}/>}
    </div>}
    {editing && <form className={styles.form} onSubmit={save} aria-label={original ? 'Sửa cơ hội' : 'Thêm cơ hội'}>
      <h4>{original ? 'Sửa cơ hội' : 'Thêm cơ hội'}</h4>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <label>Tên cơ hội<input name="name" required maxLength={200} defaultValue={original?.name ?? `${customer.name} · Tư vấn dịch vụ`}/></label>
      <div className={styles.grid}>
        <label>Dịch vụ<select name="serviceId" required disabled={Boolean(original?.quotes?.length)} defaultValue={original?.serviceId ?? ''}>
          <option value="">Chọn dịch vụ</option>{services.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Giá trị dự kiến (đ)<input name="value" type="number" required min={0} max={1e12} defaultValue={original?.value ?? 0}/></label>
        <label>Ngày dự kiến chốt<input name="closeDate" type="date" required defaultValue={original?.closeDate ?? dateToday()}/></label>
        <label>Giai đoạn<select name="stage" defaultValue={original?.stage ?? STAGES[0]}>{visibleStages.map(stage=><option key={stage}>{stage}</option>)}</select></label>
      </div>
      <label>Nhu cầu của khách<textarea name="description" rows={3} maxLength={5000} defaultValue={original?.description}/></label>
      <label>Việc tiếp theo<input name="nextAction" maxLength={5000} defaultValue={original?.nextAction}/></label>
      <label>Lý do không thành công<input name="lossReason" maxLength={3000} defaultValue={original?.lossReason}/></label>
      <div className={styles.actions}>
        <button type="button" className="btn" disabled={busy} onClick={()=>setEditing(null)}>Đóng biểu mẫu</button>
        <button className="btn primary" disabled={busy} type="submit">Lưu cơ hội</button>
      </div>
    </form>}
  </section>;
}
