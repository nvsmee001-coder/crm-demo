'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { CollectionAction, Command, Project, ProjectReceipt, Workspace } from '../lib/crm-types';
import { collectionTotals, projectBalance } from '../lib/project-collections';
import './collections.css';

interface Props {
  data: Workspace;
  today: string;
  revision: number;
  busy: boolean;
  canManage: boolean;
  onMutate: (command: Omit<Command, 'expectedRevision'>, options?: {
    expectedRevision?: number; onError?: (message: string) => void;
  }) => Promise<boolean | undefined>;
}
type Editor = { action: CollectionAction; revision: number; receipt?: ProjectReceipt };
type Segment = 'all'|'overdue'|'untracked'|'open'|'settled'|'undated';
const format = new Intl.NumberFormat('vi-VN');
const money = (value: number | bigint) => format.format(value) + ' ₫';
const day = (value: string) => value ? value.split('-').reverse().join('/') : 'Chưa hẹn';
const localDay = (timestamp: string) => new Intl.DateTimeFormat('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'}).format(new Date(timestamp));
const status = (balance: ReturnType<typeof projectBalance>) =>
  !balance ? 'Chưa đối chiếu' : balance.overdue ? 'Quá hạn' : balance.outstanding > 0 ? 'Còn phải thu' : 'Đã thu đủ';
const titles: Record<CollectionAction, string> = {
  open_project_ledger: 'Mở sổ thu tiền', set_payment_due: 'Sửa hạn thanh toán',
  record_project_receipt: 'Ghi phiếu thu', void_project_receipt: 'Hủy phiếu thu',
};

function ReceiptForm({edit, project, today, busy, close, onMutate}: Pick<Props,'today'|'busy'|'onMutate'> & {
  edit: Editor; project: Project; close: () => void;
}) {
  const [error, setError] = useState('');
  const opening = edit.action === 'open_project_ledger';
  const payment = edit.action === 'record_project_receipt';
  const cancel = edit.action === 'void_project_receipt';
  const correcting = cancel && edit.receipt?.kind === 'opening';
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
    const ok = await onMutate({action: edit.action, id: project.id, data}, {expectedRevision: edit.revision, onError: setError});
    if (ok) close();
  }
  return <form className="col-form" onSubmit={submit} aria-label={title}>
    <h4>{title}</h4>
    {opening && <p>Đối chiếu chứng từ đến thời điểm mở sổ. Nhập 0 nếu khách chưa thanh toán.</p>}
    {cancel && !correcting && <p>Phiếu {edit.receipt?.reference} · {money(edit.receipt!.amount)}. Khi hủy, số còn phải thu sẽ tăng tương ứng.</p>}
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
    </div>
    {error && <p role="alert" className="col-error">{error}</p>}
    <div className="col-buttons"><button type="submit" className="btn primary" disabled={busy}>{busy ? 'Đang lưu…' : title}</button>
      <button type="button" className="btn" onClick={close} disabled={busy}>Quay lại</button></div>
  </form>;
}

function LedgerDetail({project, customer, today, busy, revision, canManage, onMutate, back}: Omit<Props,'data'> & {
  project: Project; customer: string; back: () => void;
}) {
  const [edit, setEdit] = useState<Editor | null>(null);
  const [page, setPage] = useState(0);
  const balance = projectBalance(project, today);
  const ledger = project.ledger;
  const start = (action: CollectionAction, receipt?: ProjectReceipt) => setEdit({action, revision, receipt});
  const receiptPage = ledger?.receipts.slice(page * 20, (page + 1) * 20) || [];
  return <section className="panel col-panel">
    <button className="btn small" onClick={back} disabled={busy}>← Danh sách hợp đồng</button>
    <h2>{project.name}</h2><p>{customer} · {status(balance)}</p>
    <dl className="col-breakdown">
      <div><dt>Giá trị hợp đồng</dt><dd>{money(project.budget)}</dd></div>
      <div><dt>Đã thu</dt><dd>{balance ? money(balance.paid) : 'Chưa đối chiếu'}</dd></div>
      <div><dt>Còn phải thu</dt><dd>{balance ? money(balance.outstanding) : 'Chưa đối chiếu'}</dd></div>
      <div><dt>Hạn thanh toán</dt><dd>{day(ledger?.paymentDue || '')}</dd></div>
    </dl>
    {!ledger && <p>Chủ sở hữu mở sổ sau khi xác nhận số tiền khách đã thanh toán. Khi đó hợp đồng sẽ được tính vào báo cáo thu tiền.</p>}
    {canManage && !edit && <div className="col-buttons">
      {!ledger && <button className="btn primary" onClick={() => start('open_project_ledger')}>Mở sổ thu tiền</button>}
      {ledger && <>{Boolean(balance?.outstanding) && <button className="btn primary" onClick={() => start('record_project_receipt')}>Ghi phiếu thu</button>}
        <button className="btn" onClick={() => start('set_payment_due')}>Sửa hạn thanh toán</button></>}
    </div>}
    {edit && canManage && <ReceiptForm edit={edit} project={project} today={today} busy={busy} close={() => setEdit(null)} onMutate={onMutate}/>}
    {ledger && <><h3>Lịch sử ghi thu</h3><p>Mở sổ ngày {localDay(ledger.openedAt)} bởi {ledger.openedBy}.</p>
      <div className="col-history">{receiptPage.map(r => <div className="col-receipt" key={r.id}>
        <div><strong>{r.kind === 'opening' ? 'Số đầu kỳ' : r.reference}</strong>
          <small>{day(r.date)} · {r.createdBy}{r.voided && ' · Đã hủy'}</small>
          {r.voided && <small>Hủy ngày {localDay(r.voided.at)} bởi {r.voided.by} · {r.voided.reason}</small>}</div>
        <b className={r.voided ? 'col-void' : ''}>{money(r.amount)}</b>
        {canManage && !r.voided && !edit && <button className="btn small" onClick={() => start('void_project_receipt',r)}>{r.kind === 'opening' ? 'Điều chỉnh' : 'Hủy phiếu'}</button>}
      </div>)}</div>
      <Pagination page={page} total={ledger.receipts.length} move={setPage}/></>}
  </section>;
}

function Pagination({page, total, move}: {page: number; total: number; move: (page: number) => void}) {
  if (total <= 20) return null;
  return <div className="col-pages"><button className="btn small" disabled={!page} onClick={() => move(page - 1)}>Trước</button>
    <span>Trang {page + 1} / {Math.ceil(total / 20)}</span><button className="btn small" disabled={(page + 1) * 20 >= total} onClick={() => move(page + 1)}>Sau</button></div>;
}

export function CollectionsWorkspace({data, today, ...controls}: Props) {
  const [selection, setSelection] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const totals = useMemo(() => collectionTotals(data.projects, today), [data.projects, today]);
  const customers = useMemo(() => new Map(data.customers.map(c => [c.id, c.name])), [data.customers]);
  const projects = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('vi');
    return data.projects.map(project => ({project, balance: projectBalance(project, today)})).filter(({project,balance}) => {
      if (segment === 'overdue' && !balance?.overdue) return false;
      if (segment === 'untracked' && balance) return false;
      if (segment === 'open' && !balance?.outstanding) return false;
      if (segment === 'settled' && balance?.outstanding !== 0) return false;
      if (segment === 'undated' && (!balance?.outstanding || project.ledger?.paymentDue)) return false;
      return (project.name + ' ' + (customers.get(project.customerId) || '')).toLocaleLowerCase('vi').includes(term);
    }).sort((a,b) => Number(b.balance?.overdue || false) - Number(a.balance?.overdue || false)
      || (a.project.ledger?.paymentDue || '9999').localeCompare(b.project.ledger?.paymentDue || '9999')
      || a.project.name.localeCompare(b.project.name, 'vi'));
  }, [data.projects, customers, segment, query, today]);
  const selected = data.projects.find(p => p.id === selection);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(projects.length / 20) - 1));
  return <section className="col-workspace" aria-label="Công nợ khách hàng">
    <div className="col-cards">
      <div><span>Đã thu lũy kế</span><strong>{totals.tracked ? money(totals.paid) : '—'}</strong><small>{totals.tracked ? 'Gồm số đầu kỳ đã đối chiếu' : 'Chưa có sổ đã đối chiếu'}</small></div>
      <div><span>Còn phải thu</span><strong>{totals.tracked ? money(totals.outstanding) : '—'}</strong><small>{totals.tracked} hợp đồng đã mở sổ</small></div>
      <div><span>Phải thu quá hạn</span><strong>{totals.tracked ? money(totals.overdue) : '—'}</strong><small>{totals.lateCount} quá hạn · {totals.missingDue} còn nợ chưa có hạn</small></div>
      <div><span>Chưa đối chiếu</span><strong>{data.projects.length - totals.tracked}</strong><small>Hợp đồng chưa được tính vào số tiền</small></div>
    </div>
    {selected ? <LedgerDetail key={selected.id} project={selected} customer={customers.get(selected.customerId) || ''} today={today} {...controls} back={() => setSelection('')}/> :
    <section className="panel col-panel"><h2>Thu tiền theo hợp đồng</h2>
      <div className="col-filters"><label>Tìm hợp đồng<input type="search" placeholder="Tên dự án, khách hàng…" value={query} onChange={e => {setQuery(e.target.value);setPage(0);}}/></label>
        <label>Trạng thái<select value={segment} onChange={e => {setSegment(e.target.value as Segment);setPage(0);}}>
          <option value="all">Tất cả</option><option value="overdue">Quá hạn thanh toán</option><option value="open">Còn phải thu</option>
          <option value="undated">Còn nợ chưa có hạn</option><option value="untracked">Chưa đối chiếu</option><option value="settled">Đã thu đủ</option></select></label></div>
      {projects.length > 0 ? <div className="col-table-wrap"><table className="col-table">
        <thead><tr><th>Hợp đồng / dự án</th><th>Trạng thái</th><th>Còn phải thu</th><th>Hạn thanh toán</th></tr></thead>
        <tbody>{projects.slice(currentPage * 20, (currentPage + 1) * 20).map(({project,balance}) => <tr key={project.id}>
          <td><button className="table-title" onClick={() => setSelection(project.id)}>{project.name}</button><small>{customers.get(project.customerId)}</small></td>
          <td><span className={balance?.overdue ? 'col-late' : ''}>{status(balance)}</span></td>
          <td>{balance ? money(balance.outstanding) : '—'}</td><td>{day(project.ledger?.paymentDue || '')}</td>
        </tr>)}</tbody></table></div> :
        <p>{data.projects.length ? 'Không tìm thấy hợp đồng theo bộ lọc.' : 'Tạo dự án hoặc chốt cơ hội để bắt đầu theo dõi thu tiền.'}</p>}
      <Pagination page={currentPage} total={projects.length} move={setPage}/>
    </section>}
  </section>;
}
