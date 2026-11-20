'use client';

import { useState } from 'react';
import type { Deal } from '../lib/crm-types';
import { salesForecast, type ForecastPeriod } from '../lib/sales-forecast';
import styles from './SalesForecast.module.css';

const periods = {month: 'Tháng này', quarter: 'Quý này', all: 'Tất cả thời gian'};
const currency = new Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND', maximumFractionDigits: 0});
const displayDate = (date: string) => date ? date.slice(0, 10).split('-').reverse().join('/') : 'Chưa đặt';

export default function SalesForecast({deals, today, onOpenDeal}: {
  deals: Deal[];
  today: string;
  onOpenDeal: (deal: Deal) => void;
}) {
  const [period, setPeriod] = useState<ForecastPeriod>('month');
  const [limit, setLimit] = useState(5);
  const report = salesForecast(deals, period, today);

  return <section className={styles.panel} aria-labelledby="forecast-title">
    <header className={styles.header}>
      <div>
        <h2 id="forecast-title">Dự báo bán hàng</h2>
        <p>Tính theo ngày dự kiến chốt của các cơ hội đang mở.</p>
      </div>
      <label>Kỳ dự báo
        <select value={period} onChange={event => {
          setPeriod(event.target.value as ForecastPeriod);
          setLimit(5);
        }}>
          {Object.entries(periods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </header>
    <dl className={styles.metrics}>
      <div><dt>Giá trị kỳ vọng</dt><dd>{currency.format(report.weighted)}</dd><small>Giá trị mỗi cơ hội × xác suất chốt</small></div>
      <div><dt>Tổng giá trị cơ hội</dt><dd>{currency.format(report.total)}</dd><small>{report.entries.length} cơ hội trong kỳ</small></div>
      <div><dt>Quá ngày dự kiến chốt</dt><dd>{report.overdue}</dd><small>Cơ hội cần cập nhật tiến độ</small></div>
    </dl>
    {report.entries.length > 0 ? <>
      <div className={styles.tableWrap}><table>
        <caption className={styles.caption}>Cơ hội theo giá trị kỳ vọng</caption>
        <thead><tr><th>Cơ hội</th><th>Dự kiến chốt</th><th>Xác suất</th><th>Giá trị kỳ vọng</th></tr></thead>
        <tbody>{report.entries.slice(0, limit).map(({deal, weighted, probability, overdue}) =>
          <tr key={deal.id}>
            <td><button onClick={() => onOpenDeal(deal)}>{deal.name}</button><small>{deal.stage}</small></td>
            <td>{displayDate(deal.closeDate)}{overdue && <small className={styles.overdue}>Quá hạn</small>}</td>
            <td>{probability}%</td><td>{currency.format(weighted)}</td>
          </tr>
        )}</tbody>
      </table></div>
      {limit < report.entries.length && <button className="btn small" onClick={() => setLimit(limit + 10)}>Xem thêm cơ hội</button>}
    </> : <p className={styles.empty}>Chưa có cơ hội đang mở trong kỳ này.</p>}
  </section>;
}
