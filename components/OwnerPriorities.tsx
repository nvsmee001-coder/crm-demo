'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock } from 'lucide-react';
import type { Deal, Workspace } from '../lib/crm-types';
import { agendaClock, type AgendaItem } from '../lib/follow-up-agenda';
import { ownerPriorities, type PriorityGroup } from '../lib/owner-priorities';
import styles from './OwnerPriorities.module.css';

const groups = [
  ['all', 'Tất cả'], ['lateCare', 'Khách quá hẹn'], ['unscheduled', 'Khách chưa có lịch'], ['deal', 'Cơ hội cần cập nhật'],
] as const;
const pageSize = 5;

export default function OwnerPriorities({ data, agenda, onOpenCustomer, onOpenDeal }: {
  data: Workspace;
  agenda: AgendaItem[];
  onOpenCustomer: (id: string) => void;
  onOpenDeal: (deal: Deal) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [group, setGroup] = useState<PriorityGroup | 'all'>('all');
  const [owner, setOwner] = useState('*');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  const rows = useMemo(() => ownerPriorities(data, agenda, agendaClock(now)), [data, agenda, now]);
  const people = new Map<string, { name: string; total: number }>();
  const counts = { all: 0, lateCare: 0, unscheduled: 0, deal: 0 };
  for (const row of rows) {
    const key = '/' + row.ownerId;
    const person = people.get(key);
    if (person) person.total++;
    else people.set(key, { name: row.ownerName, total: 1 });
  }
  const selection = people.has(owner) ? owner : '*';
  const owned = selection === '*' ? rows : rows.filter(row => '/' + row.ownerId === selection);
  for (const row of owned) { counts.all++; counts[row.group]++; }
  const filtered = group === 'all' ? owned : owned.filter(row => row.group === group);
  const pages = Math.ceil(filtered.length / pageSize);
  const currentPage = Math.max(0, Math.min(page, pages - 1));
  const start = currentPage * pageSize;

  return <section className={styles.panel} aria-labelledby="owner-priorities-heading">
    <header className={styles.header}>
      <div>
        <h2 id="owner-priorities-heading">Hồ sơ cần rà soát</h2>
        <p>Khách thiếu lịch chăm sóc và cơ hội có nguy cơ bị bỏ sót. Hồ sơ quá hẹn lâu nhất đứng đầu.</p>
      </div>
      <label className={styles.owner}>Phụ trách hồ sơ
        <select value={selection} onChange={event => { setOwner(event.target.value); setPage(0); }}>
          <option value="*">Tất cả nhân sự ({rows.length})</option>
          {Array.from(people).sort((a, b) => b[1].total - a[1].total || a[1].name.localeCompare(b[1].name, 'vi'))
            .map(([key, person]) => <option key={key} value={key}>{person.name} ({person.total})</option>)}
        </select>
      </label>
    </header>
    <div className={styles.filters} role="group" aria-label="Lọc theo lý do rà soát">
      {groups.map(([key, label]) => <button type="button" key={key} aria-pressed={group === key}
        onClick={() => { setGroup(key); setPage(0); }}>{label} <span>{counts[key]}</span></button>)}
    </div>
    {filtered.length ? <ul className={styles.list}>
      {filtered.slice(start, start + pageSize).map(row => {
        const target = row.target;
        const customer = target.kind === 'customer';
        return <li key={customer ? 'customer/' + target.id : 'deal/' + target.deal.id}>
          <button type="button" className={styles.row}
            onClick={() => target.kind === 'customer' ? onOpenCustomer(target.id) : onOpenDeal(target.deal)}>
            <span className={styles.record}>
              <strong>{row.name}</strong>
              <small>{customer ? 'Khách hàng' : 'Cơ hội'} · {row.ownerName}</small>
            </span>
            <span className={styles.reason}>
              {row.reason}
              {row.date && <small><CalendarClock size={13} aria-hidden="true" />
                {row.date.split('-').reverse().join('/')}{row.time && ' · ' + row.time}
              </small>}
            </span>
            <ArrowRight className={styles.arrow} size={16} aria-hidden="true"/>
          </button>
        </li>;
      })}
    </ul> : <p className={styles.empty}>{rows.length ? 'Không có hồ sơ nào khớp bộ lọc này.' : 'Hiện chưa có hồ sơ cần rà soát.'}</p>}
    {pages > 1 && <nav className={styles.pages} aria-label="Trang hồ sơ cần rà soát">
      <span aria-live="polite">{start + 1}–{Math.min(start + pageSize, filtered.length)} / {filtered.length} hồ sơ</span>
      <button type="button" className="btn small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trước</button>
      <button type="button" className="btn small" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Sau</button>
    </nav>}
  </section>;
}
