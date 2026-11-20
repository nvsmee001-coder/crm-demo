import test from 'node:test';
import assert from 'node:assert/strict';
import { salesForecast } from '../lib/sales-forecast.js';
import type { Deal } from '../lib/crm-types.js';

const base: Deal = {
  id: 'one', name: 'Gói thiết kế', owner: 'sales', customerId: 'customer', serviceId: 'service',
  value: 1000, stage: 'Đã gửi báo giá', closeDate: '2026-11-19', nextAction: '', scope: '',
};

test('forecast preserves explicit zero and uses stage probability for older open deals', () => {
  const results = salesForecast([
    base, {...base, id: 'zero', probability: 0, closeDate: '2026-11-18'},
    {...base, stage: 'Đã chốt'}, {...base, stage: 'Không thành công'},
  ], 'month', '2026-11-19');
  assert.deepEqual(results.entries.map(row => row.deal.id), ['one', 'zero']);
  assert.equal(results.total, 2000);
  assert.equal(results.weighted, 600);
  assert.equal(results.overdue, 1);
});

test('forecast respects calendar month, quarter, and year boundaries', () => {
  const deals = ['2025-12-25', '2026-09-30', '2026-10-01', '2026-12-31', '2027-01-01']
    .map(closeDate => ({...base, id: closeDate, closeDate}));
  const report = (period: 'month'|'quarter'|'all') => salesForecast(deals, period, '2026-12-15');
  assert.deepEqual(report('month').entries.map(row => row.deal.id), ['2026-12-31']);
  assert.deepEqual(report('quarter').entries.map(row => row.deal.id), ['2026-10-01', '2026-12-31']);
  assert.equal(report('all').entries.length, deals.length);
});
