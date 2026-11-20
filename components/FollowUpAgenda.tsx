'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Download } from 'lucide-react';
import type { Workspace } from '../lib/crm-types';
import { agendaCalendar, agendaClock, buildAgenda, isLate, matchesPeriod,
  type AgendaItem, type AgendaPeriod, type AgendaViewer } from '../lib/follow-up-agenda';
import './follow-up-agenda.css';

type Props = {
  data: Workspace;
  viewer?: AgendaViewer;
  initialPeriod?: AgendaPeriod;
  onOpenCustomer: (id: string, kind: AgendaItem['kind']) => void;
};

const periods: { value: AgendaPeriod; label: string }[] = [
  { value: 'all', label: 'Tất cả' }, { value: 'due', label: 'Hôm nay và quá hạn' },
  { value: 'nextWeek', label: '7 ngày tới' },
];
const pageSize = 12;

export default function FollowUpAgenda({ data, viewer, initialPeriod = 'all', onOpenCustomer }: Props) {
  const [period, setPeriod] = useState<AgendaPeriod>(initialPeriod);
  const [owner, setOwner] = useState('');
  const [page, setPage] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);

  const clock = agendaClock(now);
  const items = useMemo(() => buildAgenda({ customers: data.customers, team: data.team }, viewer),
    [data.customers, data.team, viewer?.role, viewer?.memberId]);
  const owners = useMemo(() => Array.from(new Map(items.map(item => [item.assigneeId, item.assigneeName])))
    .sort((a, b) => a[1].localeCompare(b[1], 'vi')), [items]);
  const filtered = items.filter(item => (!owner || item.assigneeId === owner) && matchesPeriod(item, period, clock));
  const pages = Math.ceil(filtered.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const start = currentPage * pageSize;

  function exportCalendar() {
    const blob = new Blob([agendaCalendar(filtered)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'SMEE-lich-cham-soc-' + clock.today + '.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="follow-agenda" aria-label="Lịch hẹn và công việc">
    <header className="follow-agenda-head">
      <div>
        <h2>Lịch hẹn và công việc</h2>
        <p>Lịch liên hệ lại, cuộc hẹn và công việc đang chờ trong hồ sơ khách hàng.</p>
      </div>
      <button className="btn" type="button" disabled={!filtered.length} onClick={exportCalendar}
        title={'Xuất ' + filtered.length + ' mục theo bộ lọc hiện tại'}>
        <Download size={15}/> Xuất lịch (.ics)
      </button>
    </header>
    <div className="follow-agenda-filters">
      <div className="follow-agenda-period" role="group" aria-label="Khoảng thời gian">
        {periods.map(option => <button key={option.value} type="button" aria-pressed={period === option.value}
          onClick={() => { setPeriod(option.value); setPage(0); }}>{option.label}</button>)}
      </div>
      {viewer?.role !== 'account' && viewer?.role !== 'telesales' && <label className="follow-agenda-owner">
        Phụ trách
        <select value={owner} onChange={event => { setOwner(event.target.value); setPage(0); }}>
          <option value="">Tất cả nhân sự</option>
          {owners.filter(([id]) => id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>}
    </div>
    {filtered.length ? <>
      <ol className="follow-agenda-list" start={start + 1}>
        {filtered.slice(start, start + pageSize).map(item => {
          const [year, month, day] = item.date.split('-');
          const status = isLate(item, clock) ? 'Quá hạn' : item.date === clock.today ? 'Hôm nay' : '';
          return <li key={item.id}><button type="button" className="follow-agenda-entry"
            onClick={() => onOpenCustomer(item.customerId, item.kind)}
            aria-label={item.customerName + ' · ' + item.title + ' · Mở hồ sơ'}>
            <time dateTime={item.date + (item.time ? 'T' + item.time + ':00+07:00' : '')}>
              <b>{day}/{month}{year !== clock.today.slice(0, 4) ? '/' + year : ''}</b>
              <small>{item.time || 'Cả ngày'}</small>
            </time>
            <span className="follow-agenda-info"><strong>{item.title}</strong><span>{item.customerName}</span></span>
            <span className="follow-agenda-assigned"><strong>{item.kind}</strong><span>{item.assigneeName}</span></span>
            <span className="follow-agenda-status">
              {status && <small className={status === 'Quá hạn' ? 'follow-agenda-late' : 'follow-agenda-today'}>{status}</small>}
              <ArrowRight size={15} aria-hidden="true"/>
            </span>
          </button></li>;
        })}
      </ol>
      <footer className="follow-agenda-footer">
        <span aria-live="polite">{start + 1}–{Math.min(start + pageSize, filtered.length)} / {filtered.length} mục · Giờ Việt Nam</span>
        {pages > 1 && <div><button className="btn small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trang trước</button>
          <button className="btn small" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Trang sau</button></div>}
      </footer>
    </> : <div className="follow-agenda-empty" role="status">
      <CalendarDays size={24}/><b>{items.length ? 'Không có mục nào khớp bộ lọc' : 'Chưa có lịch hẹn hoặc công việc đang chờ'}</b>
      {items.length > 0 && <button className="btn small" onClick={() => { setOwner(''); setPeriod('all'); setPage(0); }}>Xem tất cả</button>}
    </div>}
  </section>;
}
