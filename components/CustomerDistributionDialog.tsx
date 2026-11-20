'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Headphones, ListChecks, Shuffle, Users, X } from 'lucide-react';
import { normalizePhone } from '../lib/crm-engine';
import type { EmployeeMutation } from './ProspectEditor';
import type { Customer } from '../lib/crm-types';

type Assignee = { id: string; name: string };
type Props = {
  customers: Customer[];
  revision: number;
  assignees: Assignee[];
  busy: boolean;
  onClose: () => void;
  onMutate: EmployeeMutation;
  onDone: () => void;
};
const currentDate = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
function validPhone(value: string) { try { return !!normalizePhone(value); } catch { return false; } }
const initials = (value: string) => value.split(' ').filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase();

export default function CustomerDistributionDialog({ customers, revision, assignees, busy, onClose, onMutate, onDone }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<'equal' | 'manual'>('equal');
  const [quotas, setQuotas] = useState<Record<string, string>>({});
  const [allowReassign, setAllowReassign] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [note, setNote] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState(currentDate);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const locked = useRef(false);
  const previewRevision = useRef(revision);
  close.current = onClose;
  locked.current = busy || submitting;
  const disabled = busy || submitting;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!locked.current) close.current(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary') || []);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);

  const uniqueCustomers = useMemo(() => [...new Map(customers.map(customer => [customer.id, customer])).values()], [customers]);
  const recipients = useMemo(() => [...new Map(assignees.map(person => [person.id, person])).values()], [assignees]);
  const chosen = recipients.filter(person => selected.includes(person.id));
  const previouslyAssigned = uniqueCustomers.filter(customer => !!customer.telesalesOwner);
  const considered = allowReassign ? uniqueCustomers : uniqueCustomers.filter(customer => !customer.telesalesOwner);
  const invalid = considered.filter(customer => !validPhone(customer.phone));
  const targets = considered.filter(customer => validPhone(customer.phone));
  const quotaTotal = chosen.reduce((sum, person) => sum + (Number(quotas[person.id]) || 0), 0);
  const quotasValid = chosen.every(person => /^\d+$/.test(quotas[person.id] || '') && Number.isSafeInteger(Number(quotas[person.id])) && Number(quotas[person.id]) <= 500);
  const assignments = chosen.map((person, index) => {
    if (method === 'equal') return { owner: person.id, ids: targets.filter((_, targetIndex) => targetIndex % chosen.length === index).map(customer => customer.id) };
    const offset = chosen.slice(0, index).reduce((sum, previous) => sum + (Number(quotas[previous.id]) || 0), 0);
    return { owner: person.id, ids: targets.slice(offset, offset + (Number(quotas[person.id]) || 0)).map(customer => customer.id) };
  });
  const assignedTo = new Map(assignments.flatMap(assignment => assignment.ids.map(id => [id, assignment.owner] as const)));
  const recipientName = (id: string) => recipients.find(person => person.id === id)?.name || 'Chưa chọn nhân viên';

  function validation() {
    if (!recipients.length) return 'Chưa có tài khoản telesales đang hoạt động. Hãy cấp quyền trong Cài đặt không gian trước khi phân chia.';
    if (!targets.length) return 'Chưa có khách phù hợp để phân chia. Kiểm tra số điện thoại hoặc lựa chọn phân công lại.';
    if (targets.length > 500) return 'Mỗi lần phân chia tối đa 500 khách hàng. Hãy thu hẹp danh sách đã chọn.';
    if (invalid.length && !skipInvalid) return `Có ${invalid.length} khách chưa có số điện thoại hợp lệ. Chọn bỏ qua các khách này hoặc quay lại bổ sung thông tin.`;
    if (!chosen.length) return 'Chọn ít nhất một nhân viên telesales nhận khách.';
    if (method === 'manual' && (!quotasValid || quotaTotal !== targets.length)) return `Tổng số khách chia cho nhân viên phải bằng ${targets.length}. Mỗi số lượng phải là số nguyên từ 0 đến 500.`;
    if (!note.trim()) return 'Ghi thông tin bàn giao để đội telesales chuẩn bị trước khi liên hệ.';
    if (!nextFollowUp || !/^\d{4}-\d{2}-\d{2}$/.test(nextFollowUp) || !Number.isFinite(new Date(nextFollowUp).getTime()) || new Date(nextFollowUp).toISOString().slice(0, 10) !== nextFollowUp) return 'Chọn ngày cần gọi hợp lệ.';
    return '';
  }
  function showPreview(event: FormEvent) {
    event.preventDefault(); if (disabled) return;
    const problem = validation(); setError(problem); if (!problem) { previewRevision.current=revision; setReviewing(true); dialog.current?.scrollTo({ top: 0, behavior: 'instant' }); }
  }
  async function submit() {
    if (locked.current) return;
    const problem = validation(); setError(problem); if (problem) { setReviewing(false); return; }
    locked.current = true; setSubmitting(true);
    try {
      const ok = await onMutate({ action: 'distribute_customers', data: { assignments: assignments.filter(assignment => assignment.ids.length > 0), note: note.trim(), nextFollowUp, allowReassign } }, {expectedRevision:previewRevision.current,onConflict:()=>setReviewing(false),onError:setError});
      if (ok) onDone();
    } catch { setError('Chưa phân chia được khách hàng. Vui lòng kiểm tra kết nối và thử lại.'); }
    finally { setSubmitting(false); locked.current = false; }
  }
  function toggleRecipient(id: string) {
    setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); setError('');
  }

  return <div className="distribution-overlay" onMouseDown={event => event.target === event.currentTarget && !disabled && onClose()}>
    <div className="distribution-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="distribution-title" tabIndex={-1}>
      <header className="distribution-header">
        <div><span className="distribution-eyebrow"><Headphones size={14}/>SMEE / ĐỘI TELESALES</span><h2 id="distribution-title">Phân chia khách hàng</h2><p>{uniqueCustomers.length} khách đã chọn · Giao đúng người, rõ bước tiếp theo.</p></div>
        <button type="button" className="icon-button" aria-label="Đóng phân chia khách hàng" onClick={onClose} disabled={disabled}><X size={18}/></button>
      </header>
      <div className="distribution-steps" aria-label="Các bước phân chia"><span className={!reviewing ? 'current' : 'done'}><i>{reviewing ? <Check size={12}/> : '1'}</i>Thiết lập</span><ArrowRight size={14}/><span className={reviewing ? 'current' : ''}><i>2</i>Xem trước & xác nhận</span></div>
      <form onSubmit={showPreview} className="distribution-body" id="customer-distribution-form">
        {error && <div className="distribution-alert error" role="alert"><AlertCircle size={17}/><p>{error}</p></div>}
        {!reviewing ? <>
          <section className="distribution-section"><div className="distribution-section-heading"><h3><Users size={17}/>1. Khách hàng sẽ phân chia</h3><span>{targets.length} khách có số hợp lệ</span></div>
            <div className="distribution-summary"><div><strong>{uniqueCustomers.length}</strong><span>Đã chọn</span></div><div><strong>{targets.length}</strong><span>Sẵn sàng</span></div><div><strong>{!allowReassign ? previouslyAssigned.length : 0}</strong><span>Đã giao · giữ nguyên</span></div></div>
            {previouslyAssigned.length > 0 && <div className="distribution-policy"><label><input type="checkbox" checked={allowReassign} disabled={disabled} onChange={event => { setAllowReassign(event.target.checked); setError(''); }}/><span>Phân công lại {previouslyAssigned.length} khách đã có telesales</span></label><p>{allowReassign ? 'Các khách này sẽ chuyển sang người nhận trong bản xem trước và trở lại trạng thái Chờ gọi.' : 'Mặc định chỉ chia khách chưa có telesales. Khách đã giao được giữ nguyên.'}</p></div>}
            {invalid.length > 0 && <div className="distribution-alert"><AlertCircle size={17}/><div><strong>{invalid.length} khách chưa có số điện thoại hợp lệ</strong><details><summary>Xem danh sách cần bổ sung</summary><ul>{invalid.map(customer => <li key={customer.id}><b>{customer.name}</b><span>{customer.phone || 'Chưa có số điện thoại'}</span></li>)}</ul></details><label className="distribution-skip"><input type="checkbox" checked={skipInvalid} disabled={disabled} onChange={event => { setSkipInvalid(event.target.checked); setError(''); }}/><span>Bỏ qua {invalid.length} khách này trong lần chia này</span></label></div></div>}
            {!targets.length && <p className="distribution-empty">Chưa có khách phù hợp. Bổ sung số điện thoại hoặc bật phân công lại nếu cần chuyển người chăm sóc.</p>}
          </section>
          <section className="distribution-section"><div className="distribution-section-heading"><h3><Headphones size={17}/>2. Nhân viên nhận khách</h3><span>{chosen.length} đã chọn</span></div>
            {!recipients.length ? <div className="distribution-empty"><Headphones size={25}/><strong>Chưa có nhân viên telesales được cấp quyền</strong><p>Vào Cài đặt không gian → Tài khoản & phân quyền, cấp vai trò telesales và bật tài khoản cho nhân viên.</p></div> : <>
              <div className="distribution-method" role="group" aria-label="Cách phân chia"><button type="button" className={method === 'equal' ? 'selected' : ''} onClick={() => { setMethod('equal'); setError(''); }} disabled={disabled}><Shuffle size={15}/>Chia đều</button><button type="button" className={method === 'manual' ? 'selected' : ''} onClick={() => { setMethod('manual'); setError(''); }} disabled={disabled}><ListChecks size={15}/>Theo số lượng</button></div>
              <p className="distribution-hint">{method === 'equal' ? 'Khách được chia lần lượt cho các nhân viên đã chọn; chênh lệch tối đa 1 khách.' : 'Nhập số lượng cho từng nhân viên. Tổng phải khớp số khách sẵn sàng.'}</p>
              <div className="distribution-recipient-list">{recipients.map(person => { const checked = chosen.some(member => member.id === person.id); const count = assignments.find(assignment => assignment.owner === person.id)?.ids.length || 0; return <div className={'distribution-recipient ' + (checked ? 'selected' : '')} key={person.id}><label><input type="checkbox" aria-label={'Chọn telesales ' + person.name} checked={checked} onChange={() => toggleRecipient(person.id)} disabled={disabled}/><span className="distribution-avatar">{initials(person.name)}</span><span><b>{person.name}</b><small>Telesales nhận khách</small></span></label>{checked && (method === 'manual' ? <label className="distribution-quota"><input type="number" min={0} max={500} step={1} inputMode="numeric" aria-label={'Số khách cho ' + person.name} value={quotas[person.id] ?? ''} disabled={disabled} onChange={event => { setQuotas(previous => ({ ...previous, [person.id]: event.target.value })); setError(''); }}/><span>khách</span></label> : <span className="distribution-count">{count} khách</span>)}</div>; })}</div>
              {method === 'manual' && <p className={'distribution-quota-total ' + (quotasValid && quotaTotal === targets.length ? 'complete' : '')}>Đã chia <strong>{quotaTotal}</strong> / {targets.length} khách{quotaTotal !== targets.length && <span>{quotaTotal < targets.length ? ` · Còn ${targets.length - quotaTotal} khách` : ` · Vượt ${quotaTotal - targets.length} khách`}</span>}</p>}
            </>}
          </section>
          <section className="distribution-section"><div className="distribution-section-heading"><h3><CalendarDays size={17}/>3. Thông tin bàn giao</h3></div><div className="distribution-fields"><label><span>Ngày cần gọi *</span><input type="date" aria-label="Ngày cần gọi khi phân chia" required value={nextFollowUp} onChange={event => setNextFollowUp(event.target.value)} disabled={disabled}/></label><label className="full"><span>Ghi chú cho đội telesales *</span><textarea aria-label="Ghi chú bàn giao khi phân chia" required maxLength={3000} placeholder="Nguồn khách, nhu cầu, kịch bản tư vấn hoặc lưu ý trước khi gọi…" value={note} onChange={event => setNote(event.target.value)} disabled={disabled}/></label></div></section>
        </> : <>
          <div className="distribution-review-title"><span><CheckCircle2 size={23}/></span><div><h3>Kiểm tra trước khi giao khách</h3><p>{targets.length} khách sẽ được đưa vào hàng chờ gọi của {assignments.filter(assignment => assignment.ids.length > 0).length} nhân viên.</p></div></div>
          <div className="distribution-preview-totals">{assignments.map(assignment => <div key={assignment.owner}><span className="distribution-avatar">{initials(recipientName(assignment.owner))}</span><span>{recipientName(assignment.owner)}<b>{assignment.ids.length} khách</b></span></div>)}</div>
          <div className="distribution-review-note"><p><strong>Ngày cần gọi:</strong> {new Date(nextFollowUp + 'T12:00:00').toLocaleDateString('vi-VN')}</p><p><strong>Bàn giao:</strong> {note.trim()}</p>{!allowReassign && previouslyAssigned.length > 0 && <p>{previouslyAssigned.length} khách đã có telesales được giữ nguyên.</p>}{invalid.length > 0 && <p>Bỏ qua {invalid.length} khách chưa có số điện thoại hợp lệ.</p>}{allowReassign && previouslyAssigned.length > 0 && <p className="distribution-reassign-warning">Bao gồm phân công lại {targets.filter(customer => !!customer.telesalesOwner).length} khách đã được giao trước đó.</p>}</div>
          <div className="distribution-preview-table"><table><thead><tr><th>Khách hàng</th><th>Số điện thoại</th><th>Telesales nhận</th></tr></thead><tbody>{targets.map(customer => <tr key={customer.id}><td><strong>{customer.name}</strong>{customer.telesalesOwner && <small>Phân công lại</small>}</td><td>{normalizePhone(customer.phone)}</td><td>{recipientName(assignedTo.get(customer.id) || '')}</td></tr>)}</tbody></table></div>
          <p className="distribution-hint">Việc đang chờ của telesales cũ chuyển cho người nhận mới. Account và lịch sử trao đổi của khách được giữ nguyên.</p>
        </>}
      </form>
      <footer className="distribution-footer"><p>{reviewing ? 'Chỉ lưu khi bạn xác nhận phân chia.' : 'Xem trước danh sách người nhận trước khi lưu.'}</p><div>{reviewing ? <><button type="button" className="btn" disabled={disabled} onClick={() => { setReviewing(false); setError(''); }}><ArrowLeft size={14}/>Điều chỉnh</button><button type="button" className="btn primary" disabled={disabled || !targets.length} onClick={submit}>{disabled ? 'Đang phân chia…' : `Xác nhận chia ${targets.length} khách`}<Check size={15}/></button></> : <><button type="button" className="btn" disabled={disabled} onClick={onClose}>Hủy</button><button type="submit" form="customer-distribution-form" className="btn primary" disabled={disabled || !recipients.length || !targets.length}>Xem trước phân chia<ArrowRight size={15}/></button></>}</div></footer>
    </div>
  </div>;
}
