'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { CollectionAction, Command, ContractChange, ProjectReceipt, ReceiptCorrection } from '../lib/crm-types';
import type { CollectionsData, CollectionsProject } from '../lib/finance-types';
import { canWriteCollections, collectionTotals, projectBalance } from '../lib/project-collections';
import './collections.css';

interface Props {
  data: CollectionsData;
  today: string;
  revision: number;
  busy: boolean;
  role: 'owner'|'manager'|'finance';
  mode: 'live'|'demo';
  initialProjectId?:string|null;
  onMutate: (command: Omit<Command, 'expectedRevision'>, options?: {
    expectedRevision?: number; onError?: (message: string) => void;
  }) => Promise<boolean | undefined>;
}
type Editor = { action: CollectionAction; revision: number; receipt?: ProjectReceipt; correction?: ReceiptCorrection; change?: ContractChange };
type Segment = 'all'|'overdue'|'untracked'|'open'|'settled'|'undated'|'unconfirmed'|'pending';
const format = new Intl.NumberFormat('vi-VN');
const money = (value: number | bigint) => format.format(value) + ' ₫';
const day = (value: string) => value ? value.split('-').reverse().join('/') : 'Chưa hẹn';
const localDay = (timestamp: string) => new Intl.DateTimeFormat('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'}).format(new Date(timestamp));
const status = (balance: ReturnType<typeof projectBalance>) =>
  !balance ? 'Chưa mở sổ' : balance.overdue ? 'Quá hạn' : balance.outstanding > 0 ? 'Còn phải thu' : 'Đã thu đủ';
const titles: Record<CollectionAction, string> = {
  open_project_ledger: 'Mở sổ thu tiền', set_payment_due: 'Sửa hạn thanh toán',
  record_project_receipt: 'Ghi phiếu thu', void_project_receipt: 'Hủy phiếu thu',
  confirm_legacy_contract: 'Xác nhận hợp đồng cũ', request_receipt_correction: 'Đề nghị xử lý phiếu thu',
  review_receipt_correction: 'Xử lý đề nghị phiếu thu', request_legacy_contract_change: 'Đề nghị điều chỉnh hợp đồng',
  review_legacy_contract_change: 'Xử lý điều chỉnh hợp đồng',
};

function ReceiptForm({edit, project, today, busy, close, onMutate}: Pick<Props,'today'|'busy'|'onMutate'> & {
  edit: Editor; project: CollectionsProject; close: () => void;
}) {
  const [error, setError] = useState('');
  const [kind,setKind] = useState<'void'|'amount'>(edit.receipt?.kind === 'opening' ? 'amount' : 'void');
  const [decision,setDecision] = useState<'approved'|'returned'>('approved');
  const opening = edit.action === 'open_project_ledger';
  const payment = edit.action === 'record_project_receipt';
  const cancel = edit.action === 'void_project_receipt';
  const correcting = cancel && edit.receipt?.kind === 'opening';
  const requestCorrection = edit.action === 'request_receipt_correction';
  const reviewCorrection = edit.action === 'review_receipt_correction';
  const confirmLegacy = edit.action === 'confirm_legacy_contract';
  const requestChange = edit.action === 'request_legacy_contract_change';
  const reviewChange = edit.action === 'review_legacy_contract_change';
  const title = correcting ? 'Điều chỉnh số đầu kỳ' : titles[edit.action];
  const balance = projectBalance(project, today);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const values = new FormData(event.currentTarget);
    const data: Record<string, unknown> = {};
    if (opening || correcting) data.openingAmount = Number(values.get('openingAmount'));
    if (opening || edit.action === 'set_payment_due') data.paymentDue = values.get('paymentDue');
    if (payment) Object.assign(data, {amount: Number(values.get('amount')), date: values.get('date'), reference: values.get('reference')});
    if (cancel) Object.assign(data, {receiptId: edit.receipt?.id, reason: values.get('reason')});
    if (confirmLegacy) Object.assign(data,{number:values.get('number'),signedOn:values.get('signedOn'),budget:Number(values.get('budget')),evidence:values.get('evidence')});
    if (requestCorrection) Object.assign(data,{receiptId:edit.receipt?.id,kind,amount:kind==='amount'?Number(values.get('amount')):undefined,reason:values.get('reason')});
    if (requestChange) Object.assign(data,{budget:Number(values.get('budget')),scope:values.get('scope'),reason:values.get('reason')});
    if (reviewCorrection || reviewChange) Object.assign(data,{correctionId:edit.correction?.id,changeId:edit.change?.id,decision,reason:values.get('reason')});
    const ok = await onMutate({action: edit.action, id: project.id, data}, {expectedRevision: edit.revision, onError: setError});
    if (ok) close();
  }
  return <form className="col-form" onSubmit={submit} aria-label={title}>
    <h4>{title}</h4>
    {opening && <p>Đối chiếu chứng từ đến thời điểm mở sổ. Nhập 0 nếu khách chưa thanh toán.</p>}
    {cancel && !correcting && <p>Phiếu {edit.receipt?.reference} · {money(edit.receipt!.amount)}. Khi hủy, số còn phải thu sẽ tăng tương ứng.</p>}
    {confirmLegacy && <p>Đối chiếu hợp đồng hoặc phụ lục đang áp dụng. CRM giữ các khoản đã ghi trong sổ thu.</p>}
    {requestCorrection && edit.receipt && <p>{edit.receipt.kind==='opening' ? 'Số đầu kỳ' : edit.receipt.reference} · {money(edit.receipt.amount)}. Số dư cập nhật sau khi Chủ sở hữu xác nhận.</p>}
    <div className="col-fields">
      {(opening || correcting) && <label>{correcting ? 'Số đầu kỳ đúng (đồng)' : 'Tổng đã thu trước khi mở sổ (đồng)'}
        <input name="openingAmount" type="number" inputMode="numeric" min="0" max={project.budget} step="1" required defaultValue={edit.receipt?.amount} autoFocus/></label>}
      {(opening || edit.action === 'set_payment_due') && <label>Hạn thanh toán phần còn lại
        <input name="paymentDue" type="date" defaultValue={project.ledger?.paymentDue || ''}/><small>Để trống nếu chưa thống nhất với khách.</small></label>}
      {payment && <>
        <label>Số tiền nhận (đồng)<input name="amount" type="number" inputMode="numeric" min="1" max={balance?.outstanding} step="1" required autoFocus/></label>
        <label>Ngày nhận tiền<input name="date" type="date" max={today} defaultValue={today} required/></label>
        <label>Mã phiếu hoặc mã giao dịch<input name="reference" maxLength={120} required/></label>
      </>}
      {cancel && <label>Lý do {correcting ? 'điều chỉnh' : 'hủy phiếu'}<input name="reason" maxLength={500} required/></label>}
      {confirmLegacy && <>
        <label>Số hợp đồng hoặc mã đối chiếu<input name="number" required maxLength={120}/></label>
        <label>Ngày ký hoặc ngày xác nhận<input name="signedOn" type="date" max={today} required/></label>
        <label>Căn cứ đối chiếu<textarea name="evidence" required rows={2} maxLength={3000}/></label>
      </>}
      {(confirmLegacy || requestChange) && <label>Giá trị hợp đồng (đồng)<input name="budget" type="number" step={1} min={Math.max(1,balance?.paid ?? 0)} max={1e12} defaultValue={project.budget} required/></label>}
      {requestChange && <><label>Phạm vi sau điều chỉnh<textarea name="scope" rows={3} maxLength={5000} defaultValue={project.scope} required/></label>
        <label>Lý do điều chỉnh<textarea name="reason" rows={2} maxLength={3000} required/></label></>}
      {requestCorrection && <>
        {edit.receipt?.kind==='payment'&&<label>Thao tác<select value={kind} onChange={event=>setKind(event.target.value as typeof kind)}><option value="void">Hủy phiếu</option><option value="amount">Điều chỉnh số tiền</option></select></label>}
        {kind==='amount'&&<label>Số tiền đúng (đồng)<input name="amount" type="number" step={1} min={edit.receipt?.kind==='opening'?0:1} max={(balance?.outstanding ?? 0)+(edit.receipt?.amount ?? 0)} defaultValue={edit.receipt?.amount} required/></label>}
        <label>Lý do đề nghị<textarea name="reason" rows={2} maxLength={500} required/></label>
      </>}
      {(reviewCorrection || reviewChange) && <>
        <label>Kết quả<select value={decision} onChange={event=>setDecision(event.target.value as typeof decision)}><option value="approved">Xác nhận</option><option value="returned">Trả lại</option></select></label>
        <label>Lý do hoặc ghi chú<textarea name="reason" rows={2} maxLength={3000} required={decision==='returned'}/></label>
      </>}
    </div>
    {error && <p role="alert" className="col-error">{error}</p>}
    <div className="col-buttons"><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : title}</button>
      <button type="button" className="btn" onClick={close} disabled={busy}>Quay lại</button></div>
  </form>;
}

function LedgerDetail({project, customer, today, busy, revision, role, mode, onMutate, back}: Omit<Props,'data'> & {
  project: CollectionsProject; customer: string; back: () => void;
}) {
  const [edit, setEdit] = useState<Editor | null>(null);
  const [page, setPage] = useState(0);
  const balance = projectBalance(project, today);
  const ledger = project.ledger;
  const confirmed = mode==='demo' || Boolean(project.contract);
  const change = project.legacyContractChanges?.at(-1);
  const canWrite = (action:CollectionAction) => canWriteCollections(action,role);
  const start = (action: CollectionAction, fields:Partial<Editor>={}) => setEdit({action,revision,...fields});
  const receiptPage = ledger?.receipts.slice(page * 20, (page + 1) * 20) || [];
  return <section className="panel col-panel">
    <button className="btn small" onClick={back} disabled={busy}>← Danh sách hợp đồng</button>
    <h2>{project.name}</h2><p>{customer} · {confirmed ? status(balance) : 'Chưa xác nhận hợp đồng'}</p>
    {project.contract&&<p>Mã hợp đồng <strong>{project.contract.number}</strong>{project.contract.signedOn&&` · Ký / xác nhận ngày ${day(project.contract.signedOn)}`}{project.contract.confirmed&&` · Đối chiếu bởi ${project.contract.confirmed.name}`}</p>}
    {project.contract?.source==='legacy'&&project.contract.evidence&&<p className="col-evidence">Căn cứ đối chiếu · {project.contract.evidence}</p>}
    <dl className="col-breakdown">
      <div><dt>Giá trị hợp đồng</dt><dd>{money(project.budget)}</dd></div>
      <div><dt>Đã thu</dt><dd>{balance ? money(balance.paid) : 'Chưa đối chiếu'}</dd></div>
      <div><dt>Còn phải thu</dt><dd>{balance ? money(balance.outstanding) : 'Chưa đối chiếu'}</dd></div>
      <div><dt>Hạn thanh toán</dt><dd>{day(ledger?.paymentDue || '')}</dd></div>
    </dl>
    {!ledger && confirmed && <p>Chủ sở hữu mở sổ sau khi đối chiếu số đã thu trước đó.</p>}
    {!confirmed && ledger && <p>Đây là số đã ghi trong sổ hiện có. Hợp đồng sẽ được tính vào tổng công nợ sau khi được xác nhận.</p>}
    {!edit && <div className="col-buttons">
      {!confirmed && canWrite('confirm_legacy_contract') && <button className="btn primary" onClick={()=>start('confirm_legacy_contract')}>Xác nhận hợp đồng cũ</button>}
      {!ledger && confirmed && canWrite('open_project_ledger') && <button className="btn primary" onClick={() => start('open_project_ledger')}>Mở sổ thu tiền</button>}
      {ledger && confirmed && Boolean(balance?.outstanding) && canWrite('record_project_receipt') && <button className="btn primary" onClick={() => start('record_project_receipt')}>Ghi phiếu thu</button>}
      {ledger && confirmed && canWrite('set_payment_due') && <button className="btn" onClick={() => start('set_payment_due')}>Sửa hạn thanh toán</button>}
      {project.contract?.source==='legacy'&&project.status!=='Hoàn tất'&&(!change||change.reviewed)&&canWrite('request_legacy_contract_change')&&
        <button className="btn" onClick={()=>start('request_legacy_contract_change')}>Đề nghị điều chỉnh hợp đồng</button>}
    </div>}
    {edit && canWrite(edit.action) && <ReceiptForm key={edit.action} edit={edit} project={project} today={today} busy={busy} close={() => setEdit(null)} onMutate={onMutate}/>}
    {!!project.legacyContractChanges?.length&&<details open={Boolean(change&&!change.reviewed)||undefined}>
      <summary>Lịch sử điều chỉnh hợp đồng</summary>
      {project.legacyContractChanges.map(item=><div className="col-receipt" key={item.id}><div><strong>{money(item.previousBudget)} → {money(item.budget)}</strong>
        <small>{item.scope}</small><small>{item.requested.name} · {item.reason}</small><small>{item.reviewed ? `${item.reviewed.decision==='approved'?'Đã xác nhận':'Đã trả lại'} · ${item.reviewed.name} · ${item.reviewed.reason}` : 'Chờ xác nhận'}</small></div>
        {!edit&&!item.reviewed&&canWrite('review_legacy_contract_change')&&<button className="btn small" onClick={()=>start('review_legacy_contract_change',{change:item})}>Xử lý điều chỉnh</button>}
      </div>)}
    </details>}
    {ledger && <><h3>Lịch sử ghi thu</h3><p>Mở sổ ngày {localDay(ledger.openedAt)} bởi {ledger.openedBy}.</p>
      <div className="col-history">{receiptPage.map(r => <div className="col-receipt" key={r.id}>
        <div><strong>{r.kind === 'opening' ? 'Số đầu kỳ' : r.reference}</strong>
          <small>{day(r.date)} · {r.createdBy}{r.voided && ' · Đã hủy'}</small>
          {r.voided && <small>Hủy ngày {localDay(r.voided.at)} bởi {r.voided.by} · {r.voided.reason}</small>}</div>
        <b className={r.voided ? 'col-void' : ''}>{money(r.amount)}</b>
        {mode==='demo' && canWrite('void_project_receipt') && !r.voided && !edit && <button className="btn small" onClick={() => start('void_project_receipt',{receipt:r})}>{r.kind === 'opening' ? 'Điều chỉnh' : 'Hủy phiếu'}</button>}
        {mode==='live' && confirmed && canWrite('request_receipt_correction') && !r.voided && !edit && !ledger.corrections?.some(item=>item.receiptId===r.id&&!item.reviewed) &&
          <button className="btn small" onClick={()=>start('request_receipt_correction',{receipt:r})}>Đề nghị xử lý</button>}
      </div>)}</div>
      <Pagination page={page} total={ledger.receipts.length} move={setPage}/></>}
    {!!ledger?.corrections?.length&&<><h3>Đề nghị xử lý phiếu thu</h3>{ledger.corrections.map(item=>{
      const receipt=ledger.receipts.find(row=>row.id===item.receiptId);
      return <div className="col-receipt" key={item.id}><div><strong>{item.kind==='void'?'Hủy phiếu':'Điều chỉnh số tiền'} · {receipt?.reference || 'Số đầu kỳ'}</strong>
        {receipt&&<small>{money(receipt.amount)}{item.kind==='amount'&&` → ${money(item.amount)}`}</small>}
        <small>{item.requested.name} · {item.reason}</small><small>{item.reviewed ? `${item.reviewed.decision==='approved'?'Đã xác nhận':'Đã trả lại'} · ${item.reviewed.name} · ${item.reviewed.reason}` : 'Chờ Chủ sở hữu xác nhận'}</small></div>
        {!edit&&!item.reviewed&&canWrite('review_receipt_correction')&&<button className="btn small" onClick={()=>start('review_receipt_correction',{correction:item})}>Xử lý đề nghị</button>}
      </div>;
    })}</>}
  </section>;
}

function Pagination({page, total, move}: {page: number; total: number; move: (page: number) => void}) {
  if (total <= 20) return null;
  return <div className="col-pages"><button className="btn small" disabled={!page} onClick={() => move(page - 1)}>Trước</button>
    <span>Trang {page + 1} / {Math.ceil(total / 20)}</span><button className="btn small" disabled={(page + 1) * 20 >= total} onClick={() => move(page + 1)}>Sau</button></div>;
}

export function CollectionsWorkspace({data, today, mode, initialProjectId, ...controls}: Props) {
  const [selection, setSelection] = useState(initialProjectId ?? '');
  const [segment, setSegment] = useState<Segment>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const eligible = useMemo(()=>data.projects.filter(project=>mode==='demo'||project.contract),[data.projects,mode]);
  const totals = useMemo(() => collectionTotals(eligible, today), [eligible, today]);
  const customers = useMemo(() => new Map(data.customers.map(c => [c.id, c.name])), [data.customers]);
  const projects = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('vi');
    return data.projects.map(project => ({project, confirmed:mode==='demo'||Boolean(project.contract), pending: Boolean(project.ledger?.corrections?.some(item=>!item.reviewed) || project.legacyContractChanges?.some(item=>!item.reviewed))}))
      .map(row=>({...row,balance:row.confirmed?projectBalance(row.project,today):undefined})).filter(({project,balance,confirmed,pending}) => {
      if (segment === 'unconfirmed' && confirmed) return false;
      if (segment === 'pending' && !pending) return false;
      if (segment === 'overdue' && !balance?.overdue) return false;
      if (segment === 'untracked' && (!confirmed || balance)) return false;
      if (segment === 'open' && !balance?.outstanding) return false;
      if (segment === 'settled' && balance?.outstanding !== 0) return false;
      if (segment === 'undated' && (!balance?.outstanding || project.ledger?.paymentDue)) return false;
      return [project.name,project.contract?.number,customers.get(project.customerId)].join(' ').toLocaleLowerCase('vi').includes(term);
    }).sort((a,b) => Number(b.balance?.overdue || false) - Number(a.balance?.overdue || false)
      || (a.project.ledger?.paymentDue || '9999').localeCompare(b.project.ledger?.paymentDue || '9999')
      || a.project.name.localeCompare(b.project.name, 'vi'));
  }, [data.projects, customers, segment, query, today,mode]);
  const selected = data.projects.find(p => p.id === selection);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(projects.length / 20) - 1));
  return <section className="col-workspace" aria-label="Công nợ khách hàng">
    <div className="col-cards">
      <div><span>Đã thu lũy kế</span><strong>{totals.tracked ? money(totals.paid) : '—'}</strong><small>{totals.tracked ? 'Gồm số đầu kỳ đã đối chiếu' : 'Chưa có sổ đã đối chiếu'}</small></div>
      <div><span>Còn phải thu</span><strong>{totals.tracked ? money(totals.outstanding) : '—'}</strong><small>{totals.tracked} hợp đồng đã mở sổ</small></div>
      <div><span>Phải thu quá hạn</span><strong>{totals.tracked ? money(totals.overdue) : '—'}</strong><small>{totals.lateCount} quá hạn · {totals.missingDue} còn nợ chưa có hạn</small></div>
      <div><span>Chưa tính vào công nợ</span><strong>{data.projects.length - totals.tracked}</strong><small>{data.projects.length - eligible.length} chưa xác nhận hợp đồng · {eligible.length - totals.tracked} chưa mở sổ</small></div>
    </div>
    {selected ? <LedgerDetail key={selected.id} project={selected} customer={customers.get(selected.customerId) || ''} today={today} mode={mode} {...controls} back={() => setSelection('')}/> :
    <section className="panel col-panel"><h2>Thu tiền theo hợp đồng</h2>
      <div className="col-filters"><label>Tìm hợp đồng<input type="search" placeholder="Tên dự án, khách hàng…" value={query} onChange={e => {setQuery(e.target.value);setPage(0);}}/></label>
        <label>Trạng thái<select value={segment} onChange={e => {setSegment(e.target.value as Segment);setPage(0);}}>
          <option value="all">Tất cả</option><option value="overdue">Quá hạn thanh toán</option><option value="open">Còn phải thu</option>
          <option value="undated">Còn nợ chưa có hạn</option><option value="untracked">Chưa mở sổ</option><option value="settled">Đã thu đủ</option>
          {mode==='live'&&<><option value="pending">Có đề nghị chờ xử lý</option>{controls.role!=='finance'&&<option value="unconfirmed">Chưa xác nhận hợp đồng</option>}</>}</select></label></div>
      {projects.length > 0 ? <div className="col-table-wrap"><table className="col-table">
        <thead><tr><th>Hợp đồng / dự án</th><th>Trạng thái</th><th>Còn phải thu</th><th>Hạn thanh toán</th></tr></thead>
        <tbody>{projects.slice(currentPage * 20, (currentPage + 1) * 20).map(({project,balance,confirmed,pending}) => <tr key={project.id}>
          <td><button className="table-title" onClick={() => setSelection(project.id)}>{project.name}</button><small>{customers.get(project.customerId)}{project.contract&&` · ${project.contract.number}`}</small></td>
          <td><span className={balance?.overdue ? 'col-late' : ''}>{confirmed?status(balance):'Chưa xác nhận hợp đồng'}</span>{pending&&<small>Chờ xử lý đề nghị</small>}</td>
          <td>{balance ? money(balance.outstanding) : '—'}</td><td>{day(project.ledger?.paymentDue || '')}</td>
        </tr>)}</tbody></table></div> :
        <p>{data.projects.length ? 'Không tìm thấy hợp đồng theo bộ lọc.' : 'Tạo dự án hoặc chốt cơ hội để bắt đầu theo dõi thu tiền.'}</p>}
      <Pagination page={currentPage} total={projects.length} move={setPage}/>
    </section>}
  </section>;
}
