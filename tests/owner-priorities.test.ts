import test from 'node:test';
import assert from 'node:assert/strict';
import type { Customer, CustomerAction, Deal, Workspace } from '../lib/crm-types.js';
import { agendaClock, buildAgenda } from '../lib/follow-up-agenda.js';
import { ownerPriorities, projectTrend } from '../lib/owner-priorities.js';

const clock = agendaClock(new Date('2026-11-30T17:30:00Z')); // 00:30, December 1 in Vietnam
const customer: Customer = {
  id: 'c', name: 'Minh', industry: '', contact: '', email: '', phone: '', notes: '', status: 'Mới', owner: 'Account A',
};
const action: CustomerAction = {
  id: 'a', title: 'Gửi mẫu', type: 'Công việc', dueDate: '2026-12-01', time: '00:29',
  owner: 'account', status: 'Cần làm', notes: '', createdAt: '', updatedAt: '',
};
const deal: Deal = {
  id: 'c', name: 'Thiết kế', stage: 'Đang tư vấn', nextAction: 'Gửi báo giá',
  closeDate: '2026-12-01', owner: 'account', customerId: 'c', serviceId: '', value: 300, scope: '',
};
const team = [
  { id: 'account', name: 'Account A', role: '', email: '', color: '' },
  { id: 'tele', name: 'Telesales B', role: '', email: '', color: '' },
];
function review(customers: Customer[], deals: Deal[] = []) {
  const data: Pick<Workspace, 'customers' | 'team' | 'deals'> = { customers, team, deals };
  return ownerPriorities(data, buildAgenda(data), clock);
}

test('review counts a customer once and uses Vietnam due times, open actions and active telesales assignment', () => {
  const rows = review([
    { ...customer, telesalesOwner: 'tele', telesalesStatus: 'Hẹn gọi lại',
      nextFollowUp: '2026-12-04', actions: [action, { ...action, id: 'twice', dueDate: '2026-12-01' }] },
    { ...customer, id: 'active', nextFollowUp: '2026-02-30', actions: [{ ...action, status: 'Hoàn tất' }] },
    { ...customer, id: 'end-of-day', nextFollowUp: '2026-12-01' },
    { ...customer, id: 'scheduled', actions: [{ ...action, time: '00:30' }] },
    { ...customer, id: 'paused', status: 'Tạm ngừng', actions: [action] },
    { ...customer, id: 'lost', status: 'Không phù hợp' },
  ]);
  assert.deepEqual(rows.map(row => [row.target, row.group, row.ownerId, row.ownerName]), [
    [{ kind: 'customer', id: 'c' }, 'lateCare', 'tele', 'Telesales B'],
    [{ kind: 'customer', id: 'active' }, 'unscheduled', 'account', 'Account A'],
  ]);
  assert.equal(rows[0].time, '00:29');
});

test('review includes each incomplete open deal once and keeps customer and deal targets distinct', () => {
  const overdue = { ...deal, closeDate: '2026-11-29', nextAction: '  ' };
  const missingDate = { ...deal, id: 'missing', closeDate: '', owner: '' };
  const rows = review([{ ...customer, nextFollowUp: '2026-11-30' }], [
    overdue, missingDate, { ...deal, id: 'healthy' }, { ...overdue, id: 'won', stage: 'Đã chốt' },
    { ...overdue, id: 'lost', stage: 'Không thành công' },
  ]);
  assert.deepEqual(rows.map(row => row.target), [{ kind: 'deal', deal: overdue }, { kind: 'customer', id: 'c' }, { kind: 'deal', deal: missingDate }]);
  assert.match(rows[0].reason, /Quá ngày dự kiến chốt.*Thiếu bước tiếp theo/);
  assert.equal(rows[2].ownerName, 'Chưa phân công');
});

test('project trend creates six distinct calendar months on the last day and excludes older projects', () => {
  const months = projectTrend([
    { startDate: '2026-03-31', budget: 1 }, { startDate: '2026-03-01', budget: 3 },
    { startDate: '2025-10-15', budget: 2 }, { startDate: '2025-09-01', budget: 80 },
    { startDate: '2026-02-30', budget: 160 },
  ], '2026-03-31');
  assert.deepEqual(months.map(m => m.key), ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
  assert.deepEqual(months.map(m => [m.value, m.count]), [[2, 1], [0, 0], [0, 0], [0, 0], [0, 0], [4, 2]]);
});
