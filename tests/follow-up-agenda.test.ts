import test from 'node:test';
import assert from 'node:assert/strict';
import { agendaCalendar, agendaClock, buildAgenda, isLate, matchesPeriod } from '../lib/follow-up-agenda.js';
import type { Customer, CustomerAction } from '../lib/crm-types.js';

const baseCustomer: Customer = {
  id: 'c', name: 'Khách A', contact: '', phone: '', email: '', industry: '', notes: '',
  owner: 'account', status: 'Đang tư vấn', nextFollowUp: '2026-12-01',
};
const baseAction: CustomerAction = {
  id: 'a', title: 'Hẹn tư vấn', type: 'Cuộc hẹn', dueDate: '2026-12-01', time: '09:30', owner: 'tele',
  status: 'Cần làm', notes: '', createdAt: '', updatedAt: '',
};

test('agenda keeps independent unfinished work and ignores inactive follow-ups and invalid dates', () => {
  const rows = buildAgenda({ customers: [
    baseCustomer,
    { ...baseCustomer, id: 'paused', status: 'Tạm ngừng', actions: [
      baseAction, { ...baseAction, id: 'done', status: 'Hoàn tất' },
      { ...baseAction, id: 'canceled', status: 'Đã hủy' }, { ...baseAction, id: 'bad', dueDate: '2026-02-30' },
    ] },
    { ...baseCustomer, id: 'legacy', nextFollowUp: undefined, actions: undefined },
  ], team: [] });
  assert.deepEqual(rows.map(row => [row.customerId, row.kind]), [['paused', 'Cuộc hẹn'], ['c', 'Chăm sóc']]);
});

test('employee agenda shows assigned actions and routes active callbacks to the telesales assignee', () => {
  const data = { team: [], customers: [
    { ...baseCustomer, telesalesOwner: 'tele', telesalesStatus: 'Hẹn gọi lại' as const, actions: [
      baseAction, { ...baseAction, id: 'other', title: 'Việc account', owner: 'account' },
    ] },
    { ...baseCustomer, id: 'unassigned', owner: 'another', actions: [baseAction] },
  ] };
  assert.deepEqual(buildAgenda(data, { role: 'telesales', memberId: 'tele' }).map(row => row.id), ['action/c/a', 'follow-up/c']);
  assert.deepEqual(buildAgenda(data, { role: 'account', memberId: 'account' }).map(row => row.id), ['action/c/other']);
  assert.deepEqual(buildAgenda(data, { role: 'telesales' }), []);
  assert.equal(buildAgenda(data).length, 5);
});

test('periods and overdue status use Vietnam date/time and cross month boundaries', () => {
  const clock = agendaClock(new Date('2026-11-30T17:30:00Z'));
  assert.deepEqual(clock, { today: '2026-12-01', time: '00:30', weekEnd: '2026-12-08' });
  const [item] = buildAgenda({ customers: [baseCustomer], team: [] });
  assert.equal(isLate(item, clock), false);
  assert.equal(isLate({ ...item, time: '00:29' }, clock), true);
  assert.equal(isLate({ ...item, time: '00:30' }, clock), false);
  assert.equal(matchesPeriod(item, 'due', clock), true);
  assert.equal(matchesPeriod(item, 'nextWeek', clock), false);
  assert.equal(matchesPeriod({ ...item, date: '2026-12-08' }, 'nextWeek', clock), true);
  assert.equal(matchesPeriod({ ...item, date: '2026-12-09' }, 'nextWeek', clock), false);
});

test('calendar distinguishes all-day dates and Vietnam appointment times, escapes text and folds UTF-8 safely', () => {
  const customer = { ...baseCustomer, nextAction: 'Gửi, kiểm tra; đơn\\hàng\r\nHẹn lại', actions: [
    { ...baseAction, title: 'Hẹn gặp '.repeat(20) },
  ] };
  const calendar = agendaCalendar(buildAgenda({ customers: [customer], team: [] }), new Date('2026-11-01T00:00:00Z'));
  const lines = calendar.split('\r\n');
  assert.ok(lines.every(line => Buffer.byteLength(line) <= 75));
  assert.equal(lines.filter(line => line === 'BEGIN:VEVENT').length, 2);
  const unfolded = calendar.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DTSTART:20261201T023000Z\r\n'));
  assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20261201\r\n'));
  assert.ok(unfolded.includes('Gửi\\, kiểm tra\\; đơn\\\\hàng\\nHẹn lại'));
});
