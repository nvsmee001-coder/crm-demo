'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import type { Workspace } from '../lib/crm-types';
import { previewCustomerImport, type CustomerImportPreviewRow } from '../lib/crm-engine';
import {
  createCustomerTemplate, CUSTOMER_EXCEL_FIELDS, guessCustomerColumns, mapCustomerExcelRows,
  PROSPECT_TEMPLATE_URL, prospectExcelFields, readCustomerExcel, type CustomerExcelSheet,
} from '../lib/customer-excel';
import type { EmployeeMutation } from './ProspectEditor';

type Props = {
  data: Workspace;
  revision: number;
  busy: boolean;
  staffRole?: 'account' | 'telesales';
  serverPreview?: boolean;
  onClose: () => void;
  onMutate: EmployeeMutation;
  onImported: (phones: string[], distribute: boolean, ids?:string[]) => void;
};
type Preview = {rows: CustomerImportPreviewRow[]; revision: number};
const statuses = {ready: 'Hợp lệ', duplicate: 'Trùng', invalid: 'Cần sửa'};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export default function CustomerImportDialog({data, revision, busy, staffRole, serverPreview=false, onClose, onMutate, onImported}: Props) {
  const usePreview=!!staffRole||serverPreview;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [sheets, setSheets] = useState<CustomerExcelSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [owner, setOwner] = useState(data.team[0]?.id || '');
  const [filename, setFilename] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [skipRejected, setSkipRejected] = useState(false);
  const [rowFilter, setRowFilter] = useState('all');
  const [remote, setRemote] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState({phones: [] as string[], ids:[] as string[], skipped: 0});
  const ref = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const previewRevision = useRef(revision);
  const locked = busy || processing;
  const fields = staffRole ? prospectExcelFields : CUSTOMER_EXCEL_FIELDS;
  const title = staffRole ? 'Nhập khách tự khai thác từ Excel' : 'Nhập khách hàng từ Excel';
  const close = useRef(onClose);
  close.current = () => {
    if (locked || running.current) return;
    if (step === 4 && staffRole) onImported(saved.phones, false);
    else onClose();
  };
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      ) || []).filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { event.preventDefault(); ref.current?.focus(); return; }
      if (!ref.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', key);
      old?.focus();
    };
  }, []);

  const sheet = sheets[sheetIndex];
  const mappingError = useMemo(() => {
    if (!sheet) return '';
    if (!staffRole && !owner) return 'Chọn account phụ trách khách hàng nhập mới.';
    if ((mapping.name ?? -1) < 0 || (mapping.phone ?? -1) < 0) return 'Ghép đủ cột Tên khách hàng và Số điện thoại.';
    const columns = Object.values(mapping).filter(value => value >= 0);
    return new Set(columns).size !== columns.length ? 'Một cột Excel chỉ được ghép với một trường thông tin.' : '';
  }, [sheet, staffRole, owner, mapping]);
  const mapped = useMemo(() => sheet && !mappingError ? mapCustomerExcelRows(sheet, mapping, fields) : [], [sheet, mapping, fields, mappingError]);
  const retrySelection = useRef<{input: typeof mapped; included: Set<number>} | null>(null);
  const local = useMemo(() => {
    if (usePreview || !mapped.length) return {rows: [], error: ''};
    try { return {rows: previewCustomerImport(mapped, data, owner), error: ''}; }
    catch (reason) { return {rows: [], error: reason instanceof Error ? reason.message : 'Không kiểm tra được dữ liệu.'}; }
  }, [mapped, data, owner, usePreview]);
  const rows = usePreview ? remote?.rows || [] : local.rows;
  const ready = rows.filter(row => row.status === 'ready');
  const duplicateCount = rows.filter(row => row.status === 'duplicate').length;
  const invalidCount = rows.length - ready.length - duplicateCount;
  const rejected = duplicateCount + invalidCount;
  const shown = rows.filter(row => rowFilter === 'all' || row.status === rowFilter);
  const chosen = staffRole ? ready.filter(row => selected.has(row.rowNumber)) : ready;

  async function chooseFile(file?: File) {
    if (!file || locked || running.current) return;
    running.current = true;
    setProcessing(true); setError(''); setSheets([]); setRemote(null); setMapping({}); setSkipRejected(false);
    try {
      const workbook = await readCustomerExcel(file);
      setSheets(workbook.sheets); setSheetIndex(0);
      setMapping(guessCustomerColumns(workbook.sheets[0].headers, fields));
      setFilename(file.name); setStep(2);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đọc được file Excel.');
      setStep(1);
    } finally { running.current = false; setProcessing(false); }
  }

  async function template() {
    setProcessing(true); setError('');
    try { download(await createCustomerTemplate(), 'SMEE-mau-nhap-khach-hang.xlsx'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tạo được file mẫu.'); }
    finally { setProcessing(false); }
  }

  async function checkRows() {
    if (locked || running.current || mappingError || !mapped.length) return;
    setError(''); setRowFilter('all');
    if (!usePreview) { previewRevision.current=revision; setStep(3); return; }
    running.current = true;
    setProcessing(true); setRemote(null);
    try {
      const response = await fetch('/api/crm/import-preview', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({rows:mapped,...(serverPreview&&!staffRole?{owner}:{})}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không kiểm tra được dữ liệu.');
      const preview: Preview = result;
      setRemote(preview);
      const prior = retrySelection.current?.input === mapped ? retrySelection.current.included : null;
      setSelected(new Set(preview.rows.filter(row => row.status === 'ready' && (!prior || prior.has(row.rowNumber))).map(row => row.rowNumber)));
      retrySelection.current = null;
      setStep(3);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không kiểm tra được dữ liệu.');
    } finally { running.current = false; setProcessing(false); }
  }

  function report() {
    const lines = [['Dòng Excel', 'Kết quả', 'Tên khách hàng', 'Số điện thoại', 'Chi tiết'],
      ...rows.map(row => [row.rowNumber, statuses[row.status], row.customer.name, row.customer.phone, row.message])];
    download(new Blob(['\ufeff' + lines.map(row => row.map(csvCell).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'}), 'SMEE-ket-qua-kiem-tra.csv');
  }
  function toggleRow(rowNumber: number) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber); else next.add(rowNumber);
      return next;
    });
  }
  async function submit() {
    if (locked || running.current || !chosen.length || mappingError || (!staffRole && (local.error || (rejected && !skipRejected)))) return;
    if (usePreview && !remote) return;
    running.current = true;
    setProcessing(true); setError('');
    const sourceFile = filename.slice(0, 180);
    try {
      let ok, failure = '', conflict = false;
      let createdIds:string[]=[];
      const options:NonNullable<Parameters<EmployeeMutation>[1]> = {preserveOnConflict:true,onConflict:()=>{conflict=true},onError:(message:string)=>{failure=message},
        onSuccess:result=>{createdIds=result.createdCustomerIds??[];}};
      if (staffRole && remote) {
        ok = await onMutate({
          action: 'import_prospects',
          data: {sourceFile, rows: mapped.filter(row => selected.has(row.rowNumber))},
        }, {...options,expectedRevision:remote.revision});
      } else {
        ok = await onMutate({action: 'import_customers', data: {rows: chosen.map(row => row.customer), owner, sourceFile}}, {...options,expectedRevision:remote?.revision??previewRevision.current});
      }
      if (!ok) {
        if (conflict) {
          if (staffRole) retrySelection.current = {input:mapped,included:new Set(selected)};
          setRemote(null); setStep(2);
        }
        setError(failure || 'Chưa lưu được đợt nhập.');
        return;
      }
      setSaved({phones: chosen.map(row => String(row.customer.phone)), ids:createdIds, skipped: rows.length - chosen.length});
      setStep(4);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Chưa lưu được đợt nhập.';
      setError(message);
    } finally { running.current = false; setProcessing(false); }
  }

  return <div className="customer-overlay" onMouseDown={event => event.target === event.currentTarget && close.current()}>
    <div className="customer-dialog customer-dialog-wide customer-import-dialog" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Đóng nhập Excel" disabled={locked} onClick={() => close.current()}><X size={18}/></button></header>
      <div className="customer-import-body">
        {step < 4 && <ol className="import-steps" aria-label="Tiến trình nhập Excel">
          {['Chọn file', 'Ghép cột', 'Kiểm tra & nhập'].map((label, index) => <li className={step === index + 1 ? 'current' : step > index + 1 ? 'complete' : ''} key={label}>
            <span>{step > index + 1 ? <Check size={13}/> : index + 1}</span>{label}
          </li>)}
        </ol>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {step === 1 && <>
          <div className="import-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void chooseFile(event.dataTransfer.files[0]); }}>
            <span className="import-file-icon"><FileSpreadsheet size={29}/></span>
            <h3>{processing ? 'Đang đọc file…' : 'Kéo thả file Excel vào đây'}</h3>
            <p>File .xlsx · tối đa 5 MB · 500 khách mỗi sheet</p>
            <label className="btn primary"><Upload size={15}/>{processing ? 'Đang xử lý…' : 'Chọn file Excel'}
              <input aria-label="Chọn file Excel khách hàng" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={locked}
                onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = ''; }}/>
            </label>
          </div>
          <div className="import-template"><div><h3>Chưa có file theo mẫu?</h3><p>Điền tên khách hàng, số điện thoại và các thông tin bạn đã biết.</p></div>
            {staffRole ? <a className="btn" href={PROSPECT_TEMPLATE_URL} download><Download size={15}/>Tải mẫu Excel</a>
              : <button className="btn" disabled={locked} onClick={() => void template()}><Download size={15}/>Tải mẫu Excel</button>}
          </div>
          <p className="import-help">{usePreview
            ? 'Các dòng đã ghép cột sẽ được gửi đến CRM để kiểm tra trùng trước khi bạn xác nhận lưu.'
            : 'File được đọc ngay trong trình duyệt. Chỉ những dòng bạn xác nhận nhập mới được lưu vào CRM.'} Với file .xls, hãy lưu lại thành .xlsx.</p>
        </>}
        {step === 2 && sheet && <>
          <div className="import-file-summary"><FileSpreadsheet size={20}/><div><strong>{filename}</strong><small>{sheet.rows.length} dòng dữ liệu · {sheet.headers.length} cột</small></div>
            <button className="btn text" disabled={locked} onClick={() => setStep(1)}>Đổi file</button>
          </div>
          <div className="import-options">
            <label className="field"><span>Sheet cần nhập</span><select disabled={locked} value={sheetIndex} onChange={event => {
              const index = Number(event.target.value); setSheetIndex(index); setMapping(guessCustomerColumns(sheets[index].headers, fields)); setSkipRejected(false);
            }}>{sheets.map((item, index) => <option value={index} key={index}>{item.name} ({item.rows.length} dòng)</option>)}</select></label>
            {staffRole ? <p className="import-help import-personal-assignment">{staffRole === 'telesales'
              ? 'Khách được gán cho bạn và thêm vào danh sách Chờ gọi.' : 'Khách được gán cho bạn và hiển thị trong mục Tự khai thác.'}</p>
              : <label className="field"><span>Account phụ trách khách nhập mới *</span><select disabled={locked} value={owner} onChange={event => setOwner(event.target.value)}>
                <option value="">Chọn nhân viên</option>{data.team.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
              </select></label>}
          </div>
          <div className="import-section-heading"><h3>Ghép cột Excel với thông tin CRM</h3><p>Kiểm tra các cột đã nhận diện. Bạn có thể chọn lại từng cột.</p></div>
          <div className="import-mapping">{fields.map(field => {
            const column = mapping[field.key] ?? -1;
            const required = 'required' in field && field.required;
            return <label key={field.key}><span>{field.label}{required && <b> *</b>}</span>
              <select aria-label={'Cột ' + field.label} value={column} disabled={locked} onChange={event => { setMapping({...mapping, [field.key]: Number(event.target.value)}); setSkipRejected(false); }}>
                <option value={-1}>{required ? 'Chọn cột bắt buộc' : 'Không nhập trường này'}</option>
                {sheet.headers.map((heading, index) => <option key={index} value={index}>{heading || 'Cột ' + (index + 1)} · cột {index + 1}</option>)}
              </select>{column >= 0 && <small>Giá trị mẫu · {sheet.rows[0]?.cells[column] || 'Trống'}</small>}
            </label>;
          })}</div>
          <p className="import-help">CRM chuẩn hóa số điện thoại để nhận ra các dạng 0…, 84… và +84… của cùng một số.</p>
          {mappingError && <div className="import-warning"><AlertCircle size={16}/>{mappingError}</div>}
        </>}
        {step === 3 && <>
          <div className="import-file-summary"><FileSpreadsheet size={20}/><div><strong>{filename}</strong>
            <small>{sheet?.name}{!staffRole && ' · Account: ' + (data.team.find(member => member.id === owner)?.name || '')}</small></div>
            <button className="btn text" disabled={!rows.length || locked} onClick={report}><Download size={14}/>Tải kết quả kiểm tra</button>
          </div>
          {local.error && <div className="form-error" role="alert">{local.error}</div>}
          <div className="import-stats">
            {([['all','Tổng số dòng',rows.length],['ready','Hợp lệ',ready.length],['duplicate','Trùng dữ liệu',duplicateCount],['invalid','Cần sửa',invalidCount]] as const)
              .map(([value,label,count]) => <button key={value} className={rowFilter === value ? 'selected' : ''} aria-pressed={rowFilter === value} onClick={() => setRowFilter(value)}><span>{label}</span><strong>{count}</strong></button>)}
          </div>
          {staffRole && ready.length > 0 && <label className="import-select-all"><input type="checkbox" checked={chosen.length === ready.length} disabled={locked}
            onChange={event => setSelected(new Set(event.target.checked ? ready.map(row => row.rowNumber) : []))}/>Chọn tất cả dòng hợp lệ <span>Đã chọn {chosen.length}/{ready.length}</span></label>}
          <div className="import-table-wrap" role="region" aria-label="Kết quả theo dòng" tabIndex={0}><table><thead><tr>
            {staffRole && <th>Chọn</th>}<th>Dòng</th><th>Khách hàng</th><th>Số điện thoại sau chuẩn hoá</th><th>Kết quả kiểm tra</th>
          </tr></thead><tbody>{shown.map(row => <tr key={row.rowNumber}>
            {staffRole && <td><input type="checkbox" aria-label={'Chọn dòng ' + row.rowNumber} checked={row.status === 'ready' && selected.has(row.rowNumber)} disabled={locked || row.status !== 'ready'} onChange={() => toggleRow(row.rowNumber)}/></td>}
            <td>{row.rowNumber}</td><td><strong>{String(row.customer.name || 'Chưa có tên')}</strong><small>{String(row.customer.email || '')}</small></td>
            <td>{String(row.customer.phone || '—')}</td><td><span className={'import-state ' + row.status}>{statuses[row.status]}</span><small>{row.message || 'Sẵn sàng tạo khách hàng mới'}</small></td>
          </tr>)}</tbody></table>{!shown.length && <p className="import-empty">Không có dòng thuộc nhóm này.</p>}</div>
          {!staffRole && rejected > 0 && <label className="import-skip"><input type="checkbox" checked={skipRejected} onChange={event => setSkipRejected(event.target.checked)} disabled={locked}/>
            <span>Bỏ qua <strong>{rejected} dòng trùng hoặc cần sửa</strong>, chỉ nhập {ready.length} dòng hợp lệ.</span></label>}
          {!ready.length && <div className="import-warning"><AlertCircle size={16}/>Chưa có dòng hợp lệ để nhập. Bạn có thể tải kết quả kiểm tra, sửa file rồi chọn lại.</div>}
        </>}
        {step === 4 && <div className="import-success" role="status"><span><CheckCircle2 size={36}/></span><h3>Đã nhập {saved.phones.length} khách hàng</h3>
          {saved.skipped > 0 && <p>Đã bỏ qua {saved.skipped} dòng.</p>}
          <p>{staffRole === 'telesales' ? 'Khách vừa nhập đã vào danh sách Chờ gọi của bạn.' : staffRole === 'account' ? 'Đã lưu các hồ sơ vào danh sách khách tự khai thác của bạn.' : 'Bạn có thể phân chia khách vừa nhập cho đội telesales ngay bây giờ.'}</p>
        </div>}
      </div>
      <footer className="import-footer">
        {step === 1 ? <button className="btn" disabled={locked} onClick={() => close.current()}>Đóng</button>
          : step === 4 ? <>
            <button className={'btn' + (staffRole ? ' primary' : '')} onClick={() => onImported(saved.phones, false,saved.ids)}>{staffRole ? 'Xem khách tự khai thác' : 'Về danh sách khách hàng'}</button>
            {!staffRole && <button className="btn primary" onClick={() => onImported(saved.phones, true,saved.ids)}>Phân chia telesales<ArrowRight size={15}/></button>}
          </> : <>
            <button className="btn" disabled={locked} onClick={() => { setStep(step === 3 ? 2 : 1); setError(''); }}><ArrowLeft size={14}/>Quay lại</button>
            {step === 2 ? <button className="btn primary" disabled={locked || !!mappingError || !sheet?.rows.length} onClick={() => void checkRows()}>
              {processing ? 'Đang kiểm tra…' : 'Kiểm tra ' + (sheet?.rows.length || 0) + ' dòng'}<ArrowRight size={15}/>
            </button> : <button className="btn primary" disabled={locked || !chosen.length || !!local.error || (!staffRole && rejected > 0 && !skipRejected)} onClick={() => void submit()}>
              {locked ? 'Đang nhập…' : 'Nhập ' + chosen.length + (staffRole ? ' khách hàng' : ' khách hàng hợp lệ')}<Check size={15}/>
            </button>}
          </>}
      </footer>
    </div>
  </div>;
}
