'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, Edit3, Mail, MessageCircle, Phone, Plus, Search, PhoneForwarded, SlidersHorizontal, Upload, Users, X } from 'lucide-react';
import CustomerProfile from './CustomerProfile';
import CustomerImportDialog from './CustomerImportDialog';
import CustomerDistributionDialog from './CustomerDistributionDialog';
import { normalizePhone } from '../lib/crm-engine';
import { CUSTOMER_STATUSES, TELESALES_STATUSES, type Command, type Customer, type Workspace } from '../lib/crm-types';

type Props = {
  data: Workspace;
  mode: 'demo' | 'live';
  telesalesAssignees?: {id:string;name:string}[];
  busy: boolean;
  createSignal: number;
  onCreateHandled?: () => void;
  openCustomerId?: string | null;
  onOpenTelesales?: () => void;
  onMutate: (command: Omit<Command, 'expectedRevision'>) => Promise<boolean | undefined>;
  onOpenProject: (id: string) => void;
  onCreateDeal: (id: string) => void;
  onEditDeal: (id: string) => void;
  onNotify: (text: string, error?: boolean) => void;
};
type Fields = Record<string, string>;
type Editor = { type: 'customer' | 'contact' | 'handoff' | 'bulk' | 'transfer'; customer?: Customer; ids?: string[] };
const priorities = ['Cao', 'Trung bình', 'Thấp'];
const channels = ['Điện thoại', 'Email', 'Gặp mặt', 'Khác'];
const outcomes = ['Đã trao đổi', 'Hẹn liên hệ lại', 'Không phản hồi', 'Quan tâm dịch vụ', 'Không còn nhu cầu'];
const dateNow = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const readableDate = (date?: string) => date ? new Date(date.slice(0, 10) + 'T12:00:00').toLocaleDateString('vi-VN') : 'Chưa hẹn';
const dateTime = (date?: string) => date ? new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Chưa liên hệ';
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
const active = (customer: Customer) => !['Tạm ngừng', 'Không phù hợp'].includes(customer.status);
const phoneTarget = (phone: string) => {
  const cleaned = phone.replace(/[\s().-]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned) ? (cleaned.startsWith('0') ? '+84' + cleaned.slice(1) : cleaned.startsWith('84') ? '+' + cleaned : cleaned) : '';
};

function CustomerDialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea, a[href]')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || []);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="customer-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className={'customer-dialog ' + (wide ? 'customer-dialog-wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <header><div><span className="customer-eyebrow">SMEE / QUAN HỆ KHÁCH HÀNG</span><h2>{title}</h2></div><button type="button" className="icon-button" aria-label="Đóng hồ sơ khách hàng" onClick={onClose}><X size={18}/></button></header>
      {children}
    </div>
  </div>;
}

export default function CustomersWorkspace({ data, mode, telesalesAssignees = [], busy, createSignal, onCreateHandled, openCustomerId, onOpenTelesales, onMutate, onOpenProject, onCreateDeal, onEditDeal, onNotify }: Props) {
  const [query, setQuery] = useState('');
  const [importOpen,setImportOpen] = useState(false);
  const [distributionIds,setDistributionIds] = useState<string[]|null>(null);
  const [importedSelection,setImportedSelection] = useState<{phones:string[];distribute:boolean}|null>(null);
  const [segment, setSegment] = useState('all');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [source, setSource] = useState('');
  const [priority, setPriority] = useState('');
  const [teleStatus, setTeleStatus] = useState('');
  const [tag, setTag] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sort, setSort] = useState('followup');
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState('');
  const [extraPhones, setExtraPhones] = useState<{label:string;value:string}[]>([]);
  const [extraEmails, setExtraEmails] = useState<{label:string;value:string}[]>([]);
  const [socialLinks, setSocialLinks] = useState<{label:string;url:string}[]>([]);
  const [relationships, setRelationships] = useState<{customerId:string;label:string}[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const signal = useRef(0);
  const teleChoices=telesalesAssignees.map(member=>({value:member.id,label:member.name}));
  const today = dateNow();
  const person = (id: string) => data.team.find(member => member.id === id || member.name === id)?.name || id || 'Chưa phân công';
  const selected = data.customers.find(customer => customer.id === selectedId);
  useEffect(() => { if (openCustomerId) setSelectedId(openCustomerId); }, [openCustomerId]);
  const sources = [...new Set(data.customers.map(customer => customer.source).filter(Boolean))].sort() as string[];
  const tags = [...new Set(data.customers.flatMap(customer => customer.tags || []))].sort();
  const counts = {
    all: data.customers.length,
    overdue: data.customers.filter(customer => active(customer) && customer.nextFollowUp && customer.nextFollowUp < today).length,
    today: data.customers.filter(customer => active(customer) && customer.nextFollowUp === today).length,
    unscheduled: data.customers.filter(customer => active(customer) && !customer.nextFollowUp).length,
  };
  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    const rawPhoneNeedle = query.replace(/[\s()+.-]/g, '');
    const phoneNeedle = rawPhoneNeedle.startsWith('0') ? '84' + rawPhoneNeedle.slice(1) : rawPhoneNeedle;
    return data.customers.filter(customer => {
      const text = [customer.name, customer.contact, customer.email, customer.phone, customer.industry, customer.source, customer.notes, customer.jobTitle, customer.background, ...(customer.tags || []), ...(customer.additionalPhones || []).map(item => item.value), ...(customer.additionalEmails || []).map(item => item.value), person(customer.owner)].filter(Boolean).join(' ');
      if (needle && !fold(text).includes(needle) && !(phoneNeedle.length >= 4 && [customer.phone,...(customer.additionalPhones||[]).map(item=>item.value)].some(value=>value.replace(/\D/g, '').includes(phoneNeedle)))) return false;
      if (status && customer.status !== status || owner && customer.owner !== owner || source && customer.source !== source || priority && (customer.priority || 'Trung bình') !== priority) return false;
      if (tag && !(customer.tags || []).includes(tag) || favoritesOnly && !customer.favorite) return false;
      if (teleStatus && (customer.telesalesStatus || 'Chưa chuyển') !== teleStatus) return false;
      if (segment === 'overdue' && !(active(customer) && customer.nextFollowUp && customer.nextFollowUp < today)) return false;
      if (segment === 'today' && !(active(customer) && customer.nextFollowUp === today)) return false;
      if (segment === 'unscheduled' && !(active(customer) && !customer.nextFollowUp)) return false;
      return true;
    }).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'vi');
      if (sort === 'recent') return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
      if (sort === 'priority') return priorities.indexOf(a.priority || 'Trung bình') - priorities.indexOf(b.priority || 'Trung bình') || a.name.localeCompare(b.name, 'vi');
      return (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999') || a.name.localeCompare(b.name, 'vi');
    });
  }, [data.customers, data.team, query, segment, status, owner, source, priority, teleStatus, tag, favoritesOnly, sort, today]);
  useEffect(() => { setPage(0); setChecked([]); }, [query, segment, status, owner, source, priority, teleStatus, tag, favoritesOnly]);
  useEffect(() => {
    if(!importedSelection)return;
    if(query||segment!=='all'||status||owner||source||priority||teleStatus||tag||favoritesOnly){
      setQuery('');setSegment('all');setStatus('');setOwner('');setSource('');setPriority('');setTeleStatus('');setTag('');setFavoritesOnly(false);return;
    }
    const phones=new Set(importedSelection.phones);
    const imported=data.customers.filter(customer=>{try{return phones.has(normalizePhone(customer.phone));}catch{return false;}});
    if(imported.length!==phones.size)return;
    const ids=imported.map(customer=>customer.id);setPage(0);setChecked(ids);
    if(importedSelection.distribute)setDistributionIds(ids);
    setImportedSelection(null);
  },[importedSelection,data.customers,query,segment,status,owner,source,priority,teleStatus,tag,favoritesOnly]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * 25, currentPage * 25 + 25);
  const chosen = filtered.filter(customer => checked.includes(customer.id));
  const advancedFilterCount = [source, priority, tag, favoritesOnly].filter(Boolean).length;
  const allChecked = visible.length > 0 && visible.every(customer => checked.includes(customer.id));

  function openEditor(type: Editor['type'], customer?: Customer) {
    setError('');
    setEditor({ type, customer, ids: type === 'transfer' ? customer ? [customer.id] : chosen.map(item => item.id) : undefined });
    if (type === 'customer') {
      setFields({ name:'',contact:'',email:'',phone:'',industry:'',notes:'',source:'',priority:'Trung bình',owner:data.team[0]?.id||'',status:'Mới',nextFollowUp:'',nextAction:'',jobTitle:'',website:'',address:'',background:'',avatarUrl:'', ...(customer ? Object.fromEntries(Object.entries(customer).filter(([,value])=>typeof value==='string')) : {}), tags:(customer?.tags||[]).join(', '), favorite:customer?.favorite?'true':'false' });
      setExtraPhones((customer?.additionalPhones||[]).map(item=>({...item})));
      setExtraEmails((customer?.additionalEmails||[]).map(item=>({...item})));
      setSocialLinks((customer?.socialLinks||[]).map(item=>({...item})));
      setRelationships((customer?.relationships||[]).map(item=>({...item})));
    }
    if (type === 'contact') setFields({ channel: 'Điện thoại', outcome: 'Đã trao đổi', note: '', nextFollowUp: customer?.nextFollowUp || '', nextAction: customer?.nextAction || '' });
    if (type === 'handoff') setFields({ owner: '', note: '' });
    if (type === 'bulk') setFields({ owner: '', status: '', priority: '', nextFollowUp: '', note: '' });
    if (type === 'transfer') setFields({ owner: telesalesAssignees.find(member=>member.id===customer?.telesalesOwner)?.id || telesalesAssignees[0]?.id || '', note: '', nextFollowUp: customer?.nextFollowUp || today });
  }
  useEffect(() => { if (createSignal !== signal.current) { signal.current = createSignal; if (createSignal > 0) { openEditor('customer'); onCreateHandled?.(); } } }, [createSignal]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy || uploadingAvatar) return;
    setError('');
    let command: Omit<Command, 'expectedRevision'>;
    if (editor.type === 'customer') {
      const keys = ['name', 'contact', 'email', 'phone', 'industry', 'notes', 'source', 'priority', 'owner', 'status', 'nextFollowUp', 'nextAction', 'jobTitle', 'website', 'address', 'background', 'avatarUrl'];
      const payload:Record<string,unknown> = Object.fromEntries(keys.map(key => [key, fields[key] || '']));
      payload.tags=[...new Set((fields.tags||'').split(',').map(item=>item.trim()).filter(Boolean))];payload.favorite=fields.favorite==='true';payload.additionalPhones=extraPhones;payload.additionalEmails=extraEmails;payload.socialLinks=socialLinks;payload.relationships=relationships;
      command = { action: editor.customer ? 'update' : 'create', collection: 'customers', id: editor.customer?.id, data: payload };
    } else if (editor.type === 'contact') command = { action: 'log_contact', id: editor.customer?.id, data: fields };
    else if (editor.type === 'handoff') command = { action: 'handoff_customer', id: editor.customer?.id, data: fields };
    else if (editor.type === 'bulk') {
      const updates = Object.fromEntries(['owner', 'status', 'priority', 'nextFollowUp'].filter(key => fields[key]).map(key => [key, fields[key]]));
      if (!Object.keys(updates).length) { setError('Chọn ít nhất một thông tin cần cập nhật.'); return; }
      if (chosen.length > 500) { setError('Mỗi lần cập nhật tối đa 500 khách hàng.'); return; }
      command = { action: 'bulk_update_customers', data: { ids: chosen.map(customer => customer.id), ...updates } };
    } else if (editor.type === 'transfer') {
      const ids = editor.ids || [];
      const missing = data.customers.filter(customer => ids.includes(customer.id) && !phoneTarget(customer.phone));
      if (missing.length) { setError('Bổ sung số điện thoại hợp lệ trước khi chuyển: ' + missing.map(customer => customer.name).join(', ')); return; }
      command = { action: 'transfer_to_telesales', data: { ids, owner: fields.owner, note: fields.note, nextFollowUp: fields.nextFollowUp } };
    } else return;
    const ok = await onMutate(command);
    if (ok) { setEditor(null); if (editor.type === 'bulk' || editor.type === 'transfer') setChecked([]); }
    else setError('Chưa lưu được. Xem thông báo lỗi và kiểm tra lại thông tin.');
  }

  async function uploadAvatar(file:File){
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>10*1024*1024){setError('Chọn ảnh PNG, JPG, WebP hoặc GIF dưới 10 MB.');return;}
    setUploadingAvatar(true);setError('');
    try{const body=new FormData();body.set('file',file);const response=await fetch('/api/uploads',{method:'POST',body});const result=await response.json() as {url?:string;error?:string};if(!response.ok||!result.url)throw new Error(result.error||'Không tải được ảnh');setFields(previous=>({...previous,avatarUrl:result.url!}));onNotify('Đã tải ảnh. Lưu hồ sơ để áp dụng.');}catch(error){setError(error instanceof Error?error.message:'Không tải được ảnh');}finally{setUploadingAvatar(false);}
  }

  function exportCustomers() {
    const rows = chosen.length ? chosen : filtered;
    const cell = (value: unknown) => { const text = String(value ?? ''); return '"' + (/^[\s]*[=+@\-]/.test(text) ? "'" : '') + text.replace(/"/g, '""') + '"'; };
    const csv = [['Tên khách hàng', 'Người liên hệ', 'Điện thoại', 'Email', 'Ngành', 'Nguồn', 'Trạng thái', 'Ưu tiên', 'Phụ trách', 'Hẹn chăm sóc', 'Việc tiếp theo', 'Ghi chú', 'Nhân viên telesales', 'Trạng thái telesales', 'Số lần gọi', 'Kết quả gọi gần nhất', 'Bàn giao telesales', 'Nhãn', 'Yêu thích', 'Chức danh', 'Website', 'Địa chỉ'].map(cell).join(','), ...rows.map(customer => [customer.name, customer.contact, customer.phone, customer.email, customer.industry, customer.source, customer.status, customer.priority, person(customer.owner), customer.nextFollowUp, customer.nextAction, customer.notes, customer.telesalesOwner ? person(customer.telesalesOwner) : '', customer.telesalesStatus || 'Chưa chuyển', customer.telesalesAttempts || 0, customer.telesalesLastOutcome || '', customer.telesalesHandoffNote || '', (customer.tags||[]).join('; '), customer.favorite?'Có':'', customer.jobTitle||'',customer.website||'',customer.address||''].map(cell).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `SMEE-khach-hang-${today}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); onNotify(`Đã xuất ${rows.length} khách hàng`);
  }
  function field(key: string, label: string, options?: { required?: boolean; type?: string; choices?: string[] | { value: string; label: string }[]; full?: boolean; hint?: string }) {
    const change = (value: string) => setFields(previous => ({ ...previous, [key]: value }));
    return <label className={'customer-field ' + (options?.full ? 'full' : '')} key={key}>
      <span>{label}{options?.required && ' *'}</span>
      {options?.choices ? <select value={fields[key] || ''} required={options.required} onChange={event => change(event.target.value)}><option value="">{editor?.type === 'bulk' ? 'Giữ nguyên' : 'Chọn…'}</option>{options.choices.map(choice => <option key={typeof choice === 'string' ? choice : choice.value} value={typeof choice === 'string' ? choice : choice.value}>{typeof choice === 'string' ? choice : choice.label}</option>)}</select>
        : options?.type === 'textarea' ? <textarea value={fields[key] || ''} onChange={event => change(event.target.value)} required={options?.required} rows={4}/>
          : <input value={fields[key] || ''} onChange={event => change(event.target.value)} onInput={options?.type === 'date' ? event => change(event.currentTarget.value) : undefined} type={options?.type || 'text'} required={options?.required} maxLength={30000}/>}
      {options?.hint && <small>{options.hint}</small>}
    </label>;
  }
  const ownerChoices = data.team.map(member => ({ value: member.id, label: member.name }));
  const filterControl = (label: string, value: string, setter: (value: string) => void, choices: string[] | { value: string; label: string }[]) => <label className="customer-filter"><span>{label}</span><select value={value} onChange={event => setter(event.target.value)}><option value="">Tất cả</option>{choices.map(choice => <option key={typeof choice === 'string' ? choice : choice.value} value={typeof choice === 'string' ? choice : choice.value}>{typeof choice === 'string' ? choice : choice.label}</option>)}</select></label>;

  return <section className="customers-workspace">
    <div className="customer-stats">
      {[['all', 'Tất cả khách hàng', counts.all, Users], ['overdue', 'Quá hẹn chăm sóc', counts.overdue, CalendarDays], ['today', 'Cần liên hệ hôm nay', counts.today, Phone], ['unscheduled', 'Chưa hẹn lần tiếp theo', counts.unscheduled, MessageCircle]].map(([key, label, count, Icon]) => {
        const Symbol = Icon as typeof Users;
        return <button key={String(key)} className={'customer-stat ' + (segment === key ? 'selected' : '')} onClick={() => setSegment(String(key))}><span><Symbol size={17}/>{String(label)}</span><strong>{Number(count)}</strong><small>{key === 'all' ? 'Hồ sơ trong không gian này' : 'Bấm để xem danh sách'}</small></button>;
      })}
    </div>
    <div className="customer-table-panel">
      <div className="customer-list-heading"><h2>Danh sách khách hàng <span>{filtered.length}</span></h2><p>Theo dõi chăm sóc · Phân công · Chuyển telesales</p></div>
      <div className="customer-toolbar">
        <label className="customer-search"><Search size={17}/><input aria-label="Tìm khách hàng" placeholder="Tên, số điện thoại, email, người phụ trách…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}><X size={15}/></button>}</label>
        <button className="btn" onClick={()=>setImportOpen(true)} disabled={busy}><Upload size={15}/>Nhập Excel</button>
        <button className={'btn customer-filter-toggle ' + (showAdvancedFilters || advancedFilterCount ? 'active' : '')} aria-expanded={showAdvancedFilters} aria-controls="customer-advanced-filters" onClick={() => setShowAdvancedFilters(value => !value)}><SlidersHorizontal size={15}/>Bộ lọc mở rộng{advancedFilterCount > 0 && <b>{advancedFilterCount}</b>}</button>
        <button className="btn" disabled={!filtered.length} onClick={exportCustomers}><Download size={15}/>{chosen.length ? `Xuất ${chosen.length} đã chọn` : 'Xuất danh sách'}</button>
      </div>
      <div className="customer-filters">
        {filterControl('Trạng thái', status, setStatus, CUSTOMER_STATUSES)}
        {filterControl('Phụ trách', owner, setOwner, ownerChoices)}
        {filterControl('Telesales', teleStatus, setTeleStatus, TELESALES_STATUSES)}
        <label className="customer-filter"><span>Sắp xếp</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="followup">Lịch chăm sóc gần nhất</option><option value="priority">Ưu tiên cao trước</option><option value="recent">Mới cập nhật</option><option value="name">Tên A → Z</option></select></label>
        {(query || status || owner || source || priority || teleStatus || tag || favoritesOnly || segment !== 'all') && <button className="customer-clear" onClick={() => { setQuery(''); setStatus(''); setOwner(''); setSource(''); setPriority(''); setTeleStatus('');setTag('');setFavoritesOnly(false); setSegment('all'); }}>Xóa bộ lọc</button>}
      </div>
      {showAdvancedFilters && <div className="customer-advanced-filters" id="customer-advanced-filters">
        {filterControl('Nguồn khách', source, setSource, sources)}
        {filterControl('Ưu tiên', priority, setPriority, priorities)}
        {filterControl('Nhãn khách', tag, setTag, tags)}
        <label className="customer-favorite-filter"><input type="checkbox" checked={favoritesOnly} onChange={event=>setFavoritesOnly(event.target.checked)}/>Chỉ khách yêu thích</label>
      </div>}
      {chosen.length > 0 && <div className="customer-bulk"><strong>Đã chọn {chosen.length} khách hàng</strong><button className="btn primary small" disabled={busy||chosen.length>500} onClick={() => setDistributionIds(chosen.map(customer=>customer.id))}><PhoneForwarded size={14}/>Phân chia telesales</button><button className="btn small" onClick={() => openEditor('transfer')}>Giao cho một người</button><button className="btn small" onClick={() => openEditor('bulk')}><Users size={14}/>Phân công / cập nhật hàng loạt</button><button onClick={() => setChecked([])}>Bỏ chọn</button></div>}
      {filtered.length>0&&<div className="customer-selection-summary"><span>Đã chọn <strong>{chosen.length}</strong> / {filtered.length} khách theo bộ lọc</span>{chosen.length<filtered.length&&filtered.length<=500&&<button onClick={()=>setChecked(filtered.map(customer=>customer.id))}>Chọn toàn bộ {filtered.length} khách</button>}{filtered.length>500&&<span>Lọc còn tối đa 500 khách để phân chia trong một lần.</span>}</div>}
      <div className="customer-table-scroll">
        <table className="customer-table"><thead><tr><th><input type="checkbox" aria-label="Chọn khách hàng trên trang này" checked={allChecked} onChange={() => setChecked(allChecked ? checked.filter(id => !visible.some(customer => customer.id === id)) : [...new Set([...checked, ...visible.map(customer => customer.id)])])}/></th><th>Khách hàng / liên hệ</th><th>Trạng thái / nguồn</th><th>Người phụ trách</th><th>Chăm sóc tiếp theo</th><th>Liên hệ nhanh</th></tr></thead><tbody>
          {visible.map(customer => <tr key={customer.id} className={checked.includes(customer.id) ? 'is-checked' : ''}>
            <td><input type="checkbox" aria-label={'Chọn ' + customer.name} checked={checked.includes(customer.id)} onChange={() => setChecked(checked.includes(customer.id) ? checked.filter(id => id !== customer.id) : [...checked, customer.id])}/></td>
            <td><button className="customer-name" onClick={() => setSelectedId(customer.id)}><span className="customer-avatar">{customer.name.slice(0, 2).toUpperCase()}</span><span><strong>{customer.favorite?'★ ':''}{customer.name}</strong><small>{customer.contact || 'Chưa có người liên hệ'}{customer.jobTitle?' · '+customer.jobTitle:''}</small></span></button><span className="customer-contact-text">{customer.phone || customer.email || 'Chưa có thông tin liên hệ'}</span>{!!customer.tags?.length&&<div className="customer-list-tags">{customer.tags.slice(0,3).map(item=><span key={item}>{item}</span>)}{customer.tags.length>3&&<span>+{customer.tags.length-3}</span>}</div>}</td>
            <td><span className={'customer-stage ' + (customer.status === 'Đang hợp tác' ? 'working' : '')}>{customer.status}</span><small className="customer-tele-status">{customer.telesalesStatus && customer.telesalesStatus!=='Chưa chuyển' ? 'Tele: '+customer.telesalesStatus : 'Chưa chuyển telesales'}</small><small className="customer-cell-note">{customer.source || 'Chưa ghi nguồn'} · {customer.industry || 'Chưa ghi ngành'}</small></td>
            <td><span className="customer-owner">{person(customer.owner)}</span><small className={'customer-priority ' + (customer.priority === 'Cao' ? 'high' : '')}>Ưu tiên {customer.priority || 'Trung bình'}</small></td>
            <td><span className={'customer-followup ' + (active(customer) && customer.nextFollowUp && customer.nextFollowUp < today ? 'late' : '')}>{customer.nextFollowUp && customer.nextFollowUp < today && active(customer) ? 'Quá hẹn · ' : customer.nextFollowUp === today ? 'Hôm nay · ' : ''}{readableDate(customer.nextFollowUp)}</span><small className="customer-cell-note customer-next">{customer.nextAction || 'Chưa đặt việc tiếp theo'}</small></td>
            <td><div className="customer-row-actions">{phoneTarget(customer.phone) && <a className="customer-round" href={'tel:' + phoneTarget(customer.phone)} aria-label={'Gọi ' + customer.name} title="Gọi điện"><Phone size={15}/></a>}<button className="customer-round" aria-label={'Chuyển telesales ' + customer.name} title="Chuyển cho đội telesales" onClick={() => openEditor('transfer', customer)}><PhoneForwarded size={15}/></button><button className="customer-round" aria-label={'Ghi liên hệ ' + customer.name} title="Ghi kết quả liên hệ" onClick={() => openEditor('contact', customer)}><Plus size={16}/></button><button className="customer-round" aria-label={'Mở hồ sơ ' + customer.name} onClick={() => setSelectedId(customer.id)}><ArrowRight size={15}/></button></div></td>
          </tr>)}
        </tbody></table>
      </div>
      {!visible.length && <div className="customer-empty"><Users size={30}/><h3>{data.customers.length ? 'Không có khách hàng phù hợp' : 'Bắt đầu từ khách hàng đầu tiên'}</h3><p>{data.customers.length ? 'Thử thay đổi từ khóa hoặc bộ lọc.' : 'Lưu thông tin liên hệ, nhu cầu và lịch chăm sóc trong cùng một hồ sơ.'}</p>{!data.customers.length && <button className="btn primary" onClick={() => openEditor('customer')}><Plus/>Thêm khách hàng</button>}</div>}
      <div className="customer-pagination"><span>{filtered.length ? `${currentPage * 25 + 1}–${Math.min((currentPage + 1) * 25, filtered.length)}` : '0'} / {filtered.length} khách hàng</span><div><button className="icon-button" aria-label="Trang khách hàng trước" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16}/></button><span>{currentPage + 1} / {pageCount}</span><button className="icon-button" aria-label="Trang khách hàng sau" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16}/></button></div></div>
    </div>

    {importOpen&&<CustomerImportDialog data={data} busy={busy} onMutate={onMutate} onClose={()=>setImportOpen(false)} onImported={(phones,distribute)=>{setImportOpen(false);setImportedSelection({phones,distribute});}}/>}
    {distributionIds&&<CustomerDistributionDialog customers={data.customers.filter(customer=>distributionIds.includes(customer.id))} assignees={telesalesAssignees} busy={busy} onMutate={onMutate} onClose={()=>setDistributionIds(null)} onDone={()=>{setDistributionIds(null);setChecked([]);}}/>}
    {selected && !editor && <CustomerProfile key={selected.id} customer={selected} data={data} mode={mode} busy={busy} onMutate={onMutate} onClose={()=>setSelectedId(null)} onEdit={()=>openEditor('customer',selected)} onLogContact={()=>openEditor('contact',selected)} onHandoff={()=>openEditor('handoff',selected)} onTransfer={()=>openEditor('transfer',selected)} onOpenTelesales={onOpenTelesales?()=>{setSelectedId(null);onOpenTelesales();}:undefined} onCreateDeal={()=>{setSelectedId(null);onCreateDeal(selected.id);}} onEditDeal={id=>{setSelectedId(null);onEditDeal(id);}} onOpenProject={id=>{setSelectedId(null);onOpenProject(id);}} onOpenCustomer={id=>setSelectedId(id)} onNotify={onNotify}/>}

    {editor && <CustomerDialog title={editor.type === 'customer' ? editor.customer ? 'Chỉnh sửa hồ sơ' : 'Thêm khách hàng' : editor.type === 'contact' ? 'Ghi kết quả liên hệ' : editor.type === 'handoff' ? 'Bàn giao khách hàng' : editor.type === 'bulk' ? `Cập nhật ${chosen.length} khách hàng` : `Chuyển ${editor.ids?.length || 0} khách cho telesales`} wide={editor.type==='customer'} onClose={() => !busy && !uploadingAvatar && setEditor(null)}>
      {<form onSubmit={submit} className="customer-editor">
        {editor.customer && <p className="customer-editor-intro">{editor.customer.name}{editor.type === 'handoff' ? ' · Đang phụ trách: ' + person(editor.customer.owner) : ''}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="customer-form-grid">
          {editor.type === 'customer' && <>
            <h3 className="customer-form-section full">Thông tin chính</h3>
            {field('name','Tên công ty / khách hàng',{required:true})}{field('contact','Người liên hệ chính')}{field('jobTitle','Chức danh người liên hệ')}{field('industry','Ngành nghề')}
            {field('phone','Điện thoại chính',{type:'tel'})}{field('email','Email chính',{type:'email'})}{field('website','Website',{type:'url',hint:'https://…'})}{field('address','Địa chỉ')}
            {field('source','Nguồn khách',{hint:'Ví dụ: giới thiệu, website, sự kiện'})}{field('owner','Account phụ trách',{required:true,choices:ownerChoices})}
            {field('status','Trạng thái',{required:true,choices:CUSTOMER_STATUSES})}{field('priority','Mức ưu tiên',{choices:priorities})}
            {field('tags','Nhãn khách hàng',{full:true,hint:'Cách nhau bằng dấu phẩy. Ví dụ: VIP, Khách giới thiệu, Tiềm năng lớn.'})}
            <label className="customer-favorite-filter full"><input type="checkbox" checked={fields.favorite==='true'} onChange={event=>setFields(previous=>({...previous,favorite:event.target.checked?'true':'false'}))}/>Đánh dấu khách hàng yêu thích</label>
            {field('avatarUrl','Ảnh đại diện / logo',{full:true,hint:'URL ảnh hoặc tải ảnh lên bên dưới.'})}
            <div className="full customer-avatar-upload"><label className="btn"><Plus size={14}/>{uploadingAvatar?'Đang tải ảnh…':'Tải ảnh / logo'}<input type="file" aria-label="Tải ảnh đại diện khách hàng" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploadingAvatar} onChange={event=>{const file=event.target.files?.[0];if(file)void uploadAvatar(file);}}/></label><small>PNG, JPG, WebP, GIF · tối đa 10 MB</small></div>
            <h3 className="customer-form-section full">Thông tin liên hệ bổ sung</h3>
            <div className="full customer-repeater"><div className="customer-repeater-heading"><b>Số điện thoại khác</b><button type="button" className="btn small" disabled={extraPhones.length>=10} onClick={()=>setExtraPhones([...extraPhones,{label:'Di động',value:''}])}><Plus size={13}/>Thêm số</button></div>{extraPhones.map((item,index)=><div className="customer-repeat-row" key={index}><input aria-label={'Nhãn số điện thoại '+(index+1)} value={item.label} placeholder="Công việc, di động…" onChange={event=>setExtraPhones(extraPhones.map((row,i)=>i===index?{...row,label:event.target.value}:row))}/><input aria-label={'Số điện thoại bổ sung '+(index+1)} type="tel" required value={item.value} onChange={event=>setExtraPhones(extraPhones.map((row,i)=>i===index?{...row,value:event.target.value}:row))}/><button type="button" className="icon-button" aria-label={'Bỏ số điện thoại '+(index+1)} onClick={()=>setExtraPhones(extraPhones.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div>
            <div className="full customer-repeater"><div className="customer-repeater-heading"><b>Email khác</b><button type="button" className="btn small" disabled={extraEmails.length>=10} onClick={()=>setExtraEmails([...extraEmails,{label:'Công việc',value:''}])}><Plus size={13}/>Thêm email</button></div>{extraEmails.map((item,index)=><div className="customer-repeat-row" key={index}><input aria-label={'Nhãn email '+(index+1)} value={item.label} onChange={event=>setExtraEmails(extraEmails.map((row,i)=>i===index?{...row,label:event.target.value}:row))}/><input aria-label={'Email bổ sung '+(index+1)} type="email" required value={item.value} onChange={event=>setExtraEmails(extraEmails.map((row,i)=>i===index?{...row,value:event.target.value}:row))}/><button type="button" className="icon-button" aria-label={'Bỏ email '+(index+1)} onClick={()=>setExtraEmails(extraEmails.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div>
            <div className="full customer-repeater"><div className="customer-repeater-heading"><b>Mạng xã hội / liên kết</b><button type="button" className="btn small" disabled={socialLinks.length>=10} onClick={()=>setSocialLinks([...socialLinks,{label:'Facebook',url:''}])}><Plus size={13}/>Thêm liên kết</button></div>{socialLinks.map((item,index)=><div className="customer-repeat-row" key={index}><input aria-label={'Tên liên kết '+(index+1)} required value={item.label} onChange={event=>setSocialLinks(socialLinks.map((row,i)=>i===index?{...row,label:event.target.value}:row))}/><input aria-label={'URL liên kết '+(index+1)} type="url" required placeholder="https://…" value={item.url} onChange={event=>setSocialLinks(socialLinks.map((row,i)=>i===index?{...row,url:event.target.value}:row))}/><button type="button" className="icon-button" aria-label={'Bỏ liên kết '+(index+1)} onClick={()=>setSocialLinks(socialLinks.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div>
            <div className="full customer-repeater"><div className="customer-repeater-heading"><b>Mối quan hệ với khách hàng khác</b><button type="button" className="btn small" disabled={relationships.length>=20||data.customers.filter(item=>item.id!==editor.customer?.id).length===0} onClick={()=>setRelationships([...relationships,{customerId:'',label:'Đối tác giới thiệu'}])}><Plus size={13}/>Thêm quan hệ</button></div>{relationships.map((item,index)=><div className="customer-repeat-row" key={index}><input aria-label={'Loại quan hệ '+(index+1)} required value={item.label} onChange={event=>setRelationships(relationships.map((row,i)=>i===index?{...row,label:event.target.value}:row))}/><select aria-label={'Khách liên quan '+(index+1)} required value={item.customerId} onChange={event=>setRelationships(relationships.map((row,i)=>i===index?{...row,customerId:event.target.value}:row))}><option value="">Chọn khách hàng</option>{data.customers.filter(item=>item.id!==editor.customer?.id).map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><button type="button" className="icon-button" aria-label={'Bỏ quan hệ '+(index+1)} onClick={()=>setRelationships(relationships.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div>
            <h3 className="customer-form-section full">Bối cảnh và chăm sóc</h3>
            {field('background','Bối cảnh / lịch sử làm quen',{type:'textarea',full:true,hint:'Biết khách từ đâu, hoạt động kinh doanh, người ra quyết định…'})}
            {field('notes','Nhu cầu / ghi chú tổng quan',{type:'textarea',full:true})}{field('nextFollowUp','Ngày chăm sóc tiếp theo',{type:'date'})}{field('nextAction','Việc cần làm tiếp theo')}
          </>}
          {editor.type === 'contact' && <>{field('channel', 'Kênh liên hệ', { required: true, choices: channels })}{field('outcome', 'Kết quả', { required: true, choices: outcomes })}{field('note', 'Nội dung đã trao đổi', { type: 'textarea', required: true, full: true })}{field('nextFollowUp', 'Hẹn chăm sóc tiếp theo', { type: 'date', hint: 'Để trống nếu chưa cần hẹn lại.' })}{field('nextAction', 'Việc cần làm tiếp theo')}</>}
          {editor.type === 'handoff' && <>{field('owner', 'Người nhận bàn giao', { required: true, choices: ownerChoices.filter(member => member.value !== editor.customer?.owner), full: true })}{field('note', 'Tình trạng khách và việc cần tiếp tục', { required: true, type: 'textarea', full: true })}<p className="customer-muted full">Thay đổi người phụ trách trong CRM; quyền xem của nhân viên nhận được áp dụng theo tài khoản đã cấp.</p></>}
          {editor.type === 'transfer' && <>{!telesalesAssignees.length&&<p className="customer-inline-warning full">Chưa có tài khoản telesales đang hoạt động. Cấp tài khoản trong Cài đặt không gian trước khi giao khách.</p>}{field('owner', 'Nhân viên telesales nhận khách', { required: true, choices: teleChoices, full: true })}{field('note', 'Thông tin bàn giao / yêu cầu tư vấn', { required: true, type: 'textarea', full: true })}{field('nextFollowUp', 'Ngày cần gọi', { required: true, type: 'date', full: true })}<p className="customer-muted full">Khách được đưa vào hàng đợi gọi. Người phụ trách account và lịch sử chăm sóc được giữ nguyên. Tài khoản telesales được cấp cho nhân viên sẽ chỉ xem các khách đã được giao.</p>{data.customers.some(customer => editor.ids?.includes(customer.id) && !phoneTarget(customer.phone)) && <p className="customer-inline-warning full">Cần bổ sung số điện thoại hợp lệ: {data.customers.filter(customer => editor.ids?.includes(customer.id) && !phoneTarget(customer.phone)).map(customer => customer.name).join(', ')}</p>}</>}
          {editor.type === 'bulk' && <>{field('owner', 'Phân công cho', { choices: ownerChoices })}{field('status', 'Chuyển trạng thái', { choices: CUSTOMER_STATUSES })}{field('priority', 'Mức ưu tiên', { choices: priorities })}{field('nextFollowUp', 'Ngày chăm sóc tiếp theo', { type: 'date' })}<p className="customer-muted full">Chỉ những trường được chọn mới thay đổi, áp dụng cho {chosen.length} khách hàng đã chọn. Lịch sử phân công được lưu lại.</p></>}
        </div><div className="customer-editor-actions"><button type="button" className="btn" disabled={busy||uploadingAvatar} onClick={() => setEditor(null)}>Hủy</button><button type="submit" className="btn primary" disabled={busy||uploadingAvatar}><Check size={15}/>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
      </form>}
    </CustomerDialog>}
  </section>;
}
