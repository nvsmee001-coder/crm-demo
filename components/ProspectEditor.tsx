'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import { CUSTOMER_STATUSES, type Command, type CRMResponse, type Customer } from '../lib/crm-types';
import './prospect-editor.css';

export type EmployeeMutation = (command: Omit<Command, 'expectedRevision'>, options?: {
  expectedRevision?: number;
  preserveOnConflict?: boolean;
  onSuccess?: (response: CRMResponse) => void;
  onError?: (message: string) => void;
}) => Promise<boolean | undefined>;

type Props = {
  customer?: Customer;
  revision: number;
  requirePhone: boolean;
  busy: boolean;
  onClose: () => void;
  onSaved: (id?: string) => void;
  onMutate: EmployeeMutation;
};

export default function ProspectEditor({customer, revision, requirePhone, busy, onClose, onSaved, onMutate}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const title = customer ? 'Cập nhật hồ sơ' : 'Thêm khách tự khai thác';
  const defaults = {
    name: customer?.name ?? '', contact: customer?.contact ?? '', phone: customer?.phone ?? '',
    email: customer?.email ?? '', industry: customer?.industry ?? '', source: customer?.source ?? '',
    notes: customer?.notes ?? '', status: customer?.status || 'Mới',
    priority: customer ? customer.priority || '' : 'Trung bình',
    nextAction: customer?.nextAction ?? '', nextFollowUp: customer?.nextFollowUp ?? '',
  };

  useEffect(() => {
    const element = dialog.current;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = priorOverflow;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saving.current) return;
    const form = new FormData(event.currentTarget);
    const values: Record<string, string> = {};
    for (const [key, initial] of Object.entries(defaults)) {
      const value = String(form.get(key) ?? '').trim();
      if (!customer || value !== initial.trim()) values[key] = value;
    }
    if (!String(form.get('name') ?? '').trim()) {
      setError('Nhập tên khách hàng trước khi lưu.');
      return;
    }
    if (customer && !Object.keys(values).length) {
      onClose();
      return;
    }

    setError('');
    saving.current = true;
    try {
      const command: Omit<Command, 'expectedRevision'> = customer
        ? {action: 'update', collection: 'customers', id: customer.id, data: values}
        : {action: 'create_prospect', data: values};
      let message = '';
      const ok = await onMutate(command, {
        expectedRevision: customer ? revision : undefined,
        onSuccess: response => onSaved(customer?.id || response.createdCustomerId),
        onError: detail => { message = detail; },
      });
      if (!ok) setError(message || 'Chưa lưu được hồ sơ. Vui lòng thử lại.');
    } finally {
      saving.current = false;
    }
  }

  return <dialog ref={dialog} className="employee-prospect-editor" aria-labelledby="prospect-editor-title"
    onCancel={event => { event.preventDefault(); if (!busy && !saving.current) onClose(); }}>
    <header>
      <h2 id="prospect-editor-title">{title}</h2>
      <button type="button" className="icon-button" aria-label="Đóng biểu mẫu" disabled={busy} onClick={onClose}><X size={18}/></button>
    </header>
    <form onSubmit={submit}>
      <div className="prospect-fields">
        <fieldset><legend>Thông tin khách hàng</legend><div className="prospect-grid">
          <label className="wide"><span>Tên khách hàng <span aria-hidden="true">*</span></span>
            <input name="name" defaultValue={defaults.name} required autoFocus maxLength={30000}/>
          </label>
          <label>Người liên hệ<input name="contact" defaultValue={defaults.contact} maxLength={30000}/></label>
          <label><span>Số điện thoại {requirePhone && <span aria-hidden="true">*</span>}</span>
            <input type="tel" name="phone" defaultValue={defaults.phone} required={requirePhone} maxLength={64}/>
          </label>
          <label>Email<input type="email" name="email" defaultValue={defaults.email} maxLength={254}/></label>
          <label>Ngành nghề<input name="industry" defaultValue={defaults.industry} maxLength={30000}/></label>
          <label className="wide">Nguồn khách<input list="prospect-sources" name="source" defaultValue={defaults.source}
            placeholder="Ví dụ: khách giới thiệu, website, sự kiện" maxLength={30000}/></label>
          <datalist id="prospect-sources">{['Khách giới thiệu','Website','Facebook','Zalo','Sự kiện'].map(source=><option key={source} value={source}/>)}</datalist>
        </div></fieldset>
        <fieldset><legend>Tiến độ khai thác</legend><div className="prospect-grid">
          <label>Trạng thái<select name="status" defaultValue={defaults.status}>
            {!CUSTOMER_STATUSES.includes(defaults.status) && <option>{defaults.status}</option>}
            {CUSTOMER_STATUSES.map(status=><option key={status}>{status}</option>)}
          </select></label>
          <label>Mức ưu tiên<select name="priority" defaultValue={defaults.priority}>
            <option value="">Chưa đặt</option>{['Thấp','Trung bình','Cao'].map(priority=><option key={priority}>{priority}</option>)}
          </select></label>
          <label className="wide">Nhu cầu<textarea name="notes" defaultValue={defaults.notes} rows={2} maxLength={30000}/></label>
          <label>Việc tiếp theo<input name="nextAction" defaultValue={defaults.nextAction} maxLength={30000}/></label>
          <label>Ngày chăm sóc tiếp theo<input name="nextFollowUp" type="date" defaultValue={defaults.nextFollowUp}/></label>
        </div></fieldset>
      </div>
      <footer>
        {error && <p role="alert" className="access-error">{error}</p>}
        <div><button className="btn" type="button" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="btn primary" disabled={busy} type="submit"><Check size={15}/>{busy ? 'Đang lưu…' : customer ? 'Lưu cập nhật' : 'Lưu khách hàng'}</button>
        </div>
      </footer>
    </form>
  </dialog>;
}
