'use client';

import { useState, type FormEvent } from 'react';
import type { Command, Deal, QuoteLine, Service } from '../lib/crm-types';
import type { EmployeeMutation } from './ProspectEditor';
import styles from './SalesWorkflow.module.css';

const dateToday = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
const money = (value: number) => value.toLocaleString('vi-VN', {style:'currency',currency:'VND'});
const quoteStatus = {draft:'Bản nháp',submitted:'Chờ duyệt',approved:'Đã duyệt',returned:'Trả lại'};
type FormKind = 'quote'|'win'|'reviewQuote'|'reviewWin'|'change'|'reviewChange';
type OpenForm = {kind:FormKind;revision:number};

export function needsSalesReview(deal: Deal) {
  const win = deal.winRequests?.at(-1);
  const change = deal.contractChanges?.at(-1);
  return deal.quotes?.at(-1)?.status === 'submitted' || Boolean(win && !win.reviewed) || Boolean(change && !change.reviewed);
}

export default function SalesDealWorkflow({deal, service, management, revision, busy, onMutate}: {
  deal: Deal; service?:Service; management:boolean; revision:number; busy:boolean; onMutate:EmployeeMutation;
}) {
  const [form, setForm] = useState<OpenForm | null>(null);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState('approved');
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const quote = deal.quotes?.at(-1);
  const win = deal.winRequests?.at(-1);
  const change = deal.contractChanges?.at(-1);
  const lastApprovedChange = deal.contractChanges?.findLast(item => item.reviewed?.decision === 'approved');
  const closed = ['Đã chốt','Không thành công'].includes(deal.stage);
  const winPending = win && !win.reviewed;
  const changePending = change && !change.reviewed;
  const confirmed = win?.reviewed?.decision === 'approved';
  const today = dateToday();

  function open(kind: FormKind) {
    setError('');
    setDecision('approved');
    if (kind === 'quote') setLines(quote?.lines ?? [{description:service?.name ?? deal.name, quantity:1, unitPrice:Math.round(deal.value || service?.price || 0)}]);
    setForm({kind,revision});
  }

  async function save(command: Omit<Command,'expectedRevision'>, expectedRevision = revision) {
    setError('');
    if (await onMutate(command, {expectedRevision,onError:setError})) setForm(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    const values = new FormData(event.currentTarget);
    const input = (key: string) => String(values.get(key) ?? '');
    const reason = input('reason');
    let command: Omit<Command,'expectedRevision'|'id'>;
    switch (form.kind) {
      case 'quote': command = {action:'save_quote',data:{
        version:quote?.status === 'draft' ? quote.version : undefined, lines, validUntil:input('validUntil'),
        scope:input('scope'), terms:input('terms'), discount:Number(input('discount')), taxBasisPoints:Math.round(Number(input('taxRate')) * 100),
      }}; break;
      case 'win': command = {action:'request_deal_win',data:{version:quote?.version,evidence:input('evidence')}}; break;
      case 'reviewQuote': command = {action:'review_quote',data:{version:quote?.version,decision,reason}}; break;
      case 'reviewWin': command = {action:'review_deal_win',data:{requestId:win?.id,decision,reason,contractNumber:input('contractNumber'),dueDate:input('dueDate') || undefined}}; break;
      case 'change': command = {action:'request_contract_change',data:{budget:Number(input('budget')),scope:input('scope'),reason}}; break;
      case 'reviewChange': command = {action:'review_contract_change',data:{changeId:change?.id,decision,reason}}; break;
    }
    await save({...command,id:deal.id}, form.revision);
  }

  function setLine(index: number, update: Partial<QuoteLine>) {
    setLines(items => items.map((item, current) => current === index ? {...item,...update} : item));
  }

  const formTitle = form && {
    quote:quote?.status === 'draft' ? `Sửa bản nháp V${quote.version}` : 'Tạo phiên bản báo giá',
    win:'Đề nghị chốt thắng', reviewQuote:'Xử lý báo giá', reviewWin:'Xử lý đề nghị chốt thắng',
    change:'Đề nghị điều chỉnh hợp đồng', reviewChange:'Xử lý điều chỉnh hợp đồng',
  }[form.kind];
  const isReview = form?.kind.startsWith('review');
  return <section className={styles.workflow} aria-label="Báo giá và hợp đồng">
    <header className={styles.heading}><h3>Báo giá và hợp đồng</h3>
      {!closed && !winPending && quote?.status !== 'submitted' && <button className="btn small" disabled={busy || Boolean(form)} onClick={()=>open('quote')}>{quote?.status === 'draft' ? 'Sửa bản nháp' : quote ? 'Tạo phiên bản mới' : 'Lập báo giá'}</button>}
    </header>
    {deal.lossReason && deal.stage === 'Không thành công' && <p>Lý do không thành công · {deal.lossReason}</p>}
    {!quote && !closed && <p>Chưa có báo giá.</p>}
    {!!deal.quotes?.length && <ul className={styles.rows}>
      {[...deal.quotes].reverse().map(item => <li key={item.version}>
        <div><strong>Phiên bản {item.version} · {money(item.total)}</strong><small>{quoteStatus[item.status]} · Hiệu lực đến {item.validUntil}</small>
          {item.reviewed && <small>{item.reviewed.name}{item.reviewed.reason && ` · ${item.reviewed.reason}`}</small>}
          <details><summary>Chi tiết báo giá</summary>
            <p>{item.recipient.name} · {item.service.name}</p>
            {item.lines.map((line,index)=><p key={index}>{line.description} · {line.quantity} × {money(line.unitPrice)}</p>)}
            <p>Chiết khấu {money(item.discount)} · Thuế {item.taxBasisPoints / 100}% ({money(item.tax)})</p>
            <p><strong>Phạm vi </strong>{item.scope}</p><p><strong>Điều khoản </strong>{item.terms}</p>
            {item.service.exclusions && <p><strong>Ngoài phạm vi </strong>{item.service.exclusions}</p>}
          </details>
        </div>
        {item.status === 'approved' && <a className="btn small" href={`/quotes/${encodeURIComponent(deal.id)}?version=${item.version}`} target="_blank" rel="noopener noreferrer">Xem / in báo giá</a>}
      </li>)}
    </ul>}
    {!closed && !form && <div className={styles.actions}>
      {quote?.status === 'draft' && <button className="btn primary" disabled={busy || quote.validUntil < today} onClick={()=>void save({action:'submit_quote',id:deal.id,data:{version:quote.version}})}>Trình duyệt báo giá</button>}
      {quote?.status === 'submitted' && management && <button className="btn primary" disabled={busy} onClick={()=>open('reviewQuote')}>Duyệt / trả lại báo giá</button>}
      {quote?.status === 'approved' && !winPending && <button className="btn primary" disabled={busy || quote.validUntil < today} onClick={()=>open('win')}>Đề nghị chốt thắng</button>}
      {winPending && management && <button className="btn primary" disabled={busy} onClick={()=>open('reviewWin')}>Xác nhận / trả lại chốt thắng</button>}
    </div>}
    {quote?.validUntil && quote.validUntil < today && !closed && <p>Báo giá đã hết hiệu lực.</p>}
    {win && <div className={styles.record}>
      <strong>{confirmed ? `Hợp đồng ${win.contractNumber}` : winPending ? 'Chờ xác nhận chốt thắng' : 'Đề nghị chốt đã trả lại'}</strong>
      <p>{win.requested.name} · {win.evidence}</p>
      {win.reviewed && <small>{win.reviewed.name}{win.reviewed.reason && ` · ${win.reviewed.reason}`}</small>}
    </div>}
    {confirmed && <div className={styles.record}>
      <strong>Giá trị hiện tại · {money(lastApprovedChange?.budget ?? deal.value)}</strong>
      {changePending && <p>Đang chờ xác nhận điều chỉnh.</p>}
      {!form && (changePending ? management && <button className="btn" disabled={busy} onClick={()=>open('reviewChange')}>Xử lý điều chỉnh</button> : <button className="btn" disabled={busy} onClick={()=>open('change')}>Đề nghị điều chỉnh hợp đồng</button>)}
      {!!deal.contractChanges?.length && <details open={changePending || undefined}><summary>Lịch sử điều chỉnh</summary>
        <ul className={styles.rows}>{[...deal.contractChanges].reverse().map(item => <li key={item.id}><div>
          <strong>{money(item.previousBudget)} → {money(item.budget)}</strong><p>{item.reason}</p><p>{item.scope}</p>
          <small>{item.requested.name} · {item.reviewed ? `${item.reviewed.decision === 'approved' ? 'Đã xác nhận' : 'Trả lại'} bởi ${item.reviewed.name}${item.reviewed.reason ? ` · ${item.reviewed.reason}` : ''}` : 'Chờ xác nhận'}</small>
        </div></li>)}</ul>
      </details>}
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {form && <form key={`${form.kind}:${form.revision}`} className={styles.form} onSubmit={submit} aria-label={formTitle ?? undefined}>
      <h4>{formTitle}</h4>
      {form.kind === 'quote' && <>
        <label>Hiệu lực đến<input type="date" name="validUntil" required min={today} defaultValue={quote?.validUntil && quote.validUntil >= today ? quote.validUntil : today}/></label>
        {lines.map((line,index) => <fieldset key={index}><legend>Hạng mục {index + 1}</legend>
          <label>Tên hạng mục<input required maxLength={200} value={line.description} onChange={event=>setLine(index,{description:event.target.value})}/></label>
          <div className={styles.grid}>
            <label>Số lượng<input type="number" required min={1} max={1000} value={line.quantity || ''} onChange={event=>setLine(index,{quantity:Number(event.target.value)})}/></label>
            <label>Đơn giá (đ)<input type="number" required min={0} max={1e12} value={line.unitPrice} onChange={event=>setLine(index,{unitPrice:Number(event.target.value)})}/></label>
          </div>
          {lines.length > 1 && <button type="button" className="btn small" onClick={()=>setLines(items=>items.filter((_,current)=>current!==index))}>Xóa hạng mục {index + 1}</button>}
        </fieldset>)}
        <button type="button" className="btn small" disabled={lines.length >= 20} onClick={()=>setLines(items=>[...items,{description:'',quantity:1,unitPrice:0}])}>Thêm hạng mục</button>
        <div className={styles.grid}>
          <label>Chiết khấu (đ)<input name="discount" type="number" required min={0} max={1e12} defaultValue={quote?.discount ?? 0}/></label>
          <label>Thuế suất (%)<input name="taxRate" type="number" required min={0} max={100} step="0.01" defaultValue={(quote?.taxBasisPoints ?? 0)/100}/></label>
        </div>
        <label>Phạm vi và đầu ra<textarea name="scope" rows={3} required maxLength={5000} defaultValue={quote?.scope ?? (deal.scope || service?.deliverables)}/></label>
        <label>Điều khoản thanh toán và thực hiện<textarea name="terms" rows={3} required maxLength={5000} defaultValue={quote?.terms}/></label>
      </>}
      {form.kind === 'win' && <label>Căn cứ thỏa thuận<textarea name="evidence" rows={3} required maxLength={3000} placeholder="Ví dụ ngày ký và nơi lưu hợp đồng"/></label>}
      {form.kind === 'change' && <>
        <label>Giá trị sau điều chỉnh (đ)<input name="budget" type="number" required min={1} max={1e12} defaultValue={lastApprovedChange?.budget ?? deal.value}/></label>
        <label>Phạm vi sau điều chỉnh<textarea name="scope" rows={3} required maxLength={5000} defaultValue={lastApprovedChange?.scope ?? deal.scope}/></label>
        <label>Lý do điều chỉnh<textarea name="reason" rows={3} required maxLength={3000}/></label>
      </>}
      {isReview && <>
        <label>Kết quả xử lý<select value={decision} onChange={event=>setDecision(event.target.value)}><option value="approved">Xác nhận</option><option value="returned">Trả lại</option></select></label>
        {form.kind === 'reviewWin' && decision === 'approved' && <div className={styles.grid}>
          <label>Số hợp đồng hoặc mã xác nhận<input name="contractNumber" required maxLength={120}/></label>
          <label>Hạn bàn giao<input name="dueDate" type="date" min={today}/></label>
        </div>}
        <label>Lý do / ghi chú xử lý<textarea name="reason" rows={3} maxLength={3000} required={decision === 'returned'}/></label>
      </>}
      <div className={styles.actions}>
        <button type="button" className="btn" disabled={busy} onClick={()=>{setForm(null);setError('');}}>Đóng biểu mẫu</button>
        <button className="btn primary" disabled={busy} type="submit">{form.kind === 'quote' ? 'Lưu bản nháp' : 'Lưu yêu cầu'}</button>
      </div>
    </form>}
  </section>;
}
