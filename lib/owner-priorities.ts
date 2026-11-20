import type { Deal, Project, Workspace } from './crm-types.js';
import { activeTelesalesOwner, dateOnly, isLate, type AgendaItem } from './follow-up-agenda.js';

export type PriorityGroup = 'lateCare' | 'unscheduled' | 'deal';
type Target = { kind: 'customer'; id: string } | { kind: 'deal'; deal: Deal };
export interface OwnerPriority {
  target: Target;
  group: PriorityGroup;
  name: string;
  ownerId: string;
  ownerName: string;
  date: string;
  time: string;
  reason: string;
}

export function ownerPriorities(
  data: Pick<Workspace, 'customers' | 'team' | 'deals'>,
  agenda: AgendaItem[],
  clock: Parameters<typeof isLate>[1],
): OwnerPriority[] {
  const people = new Map(data.team.map(person => [person.name, person]));
  for (const person of data.team) people.set(person.id, person);
  function assignee(id: string) {
    const person = people.get(id);
    return { ownerId: person?.id || id || '', ownerName: person?.name || id || 'Chưa phân công' };
  }
  // buildAgenda returns pending appointments in chronological order.
  const earliest = new Map<string, AgendaItem>();
  for (const item of agenda) {
    if (!earliest.has(item.customerId)) earliest.set(item.customerId, item);
  }
  const rows: OwnerPriority[] = [];
  for (const customer of data.customers) {
    if (customer.status === 'Tạm ngừng' || customer.status === 'Không phù hợp') continue;
    const item = earliest.get(customer.id);
    if (item && !isLate(item, clock)) continue;
    rows.push({
      target: { kind: 'customer', id: customer.id }, name: customer.name,
      group: item ? 'lateCare' : 'unscheduled', ...assignee(activeTelesalesOwner(customer) || customer.owner),
      date: item?.date || '', time: item?.time || '',
      reason: item ? 'Quá hẹn · ' + item.title : 'Chưa có lịch liên hệ hoặc công việc có hạn',
    });
  }
  for (const deal of data.deals) {
    if (deal.stage === 'Đã chốt' || deal.stage === 'Không thành công') continue;
    const closeDate = dateOnly(deal.closeDate);
    const pastClose = Boolean(closeDate && closeDate < clock.today);
    const reasons: string[] = [];
    if (pastClose) reasons.push('Quá ngày dự kiến chốt');
    if (!closeDate) reasons.push('Thiếu ngày dự kiến chốt');
    if (!deal.nextAction?.trim()) reasons.push('Thiếu bước tiếp theo');
    if (reasons.length) rows.push({
      target: { kind: 'deal', deal }, name: deal.name, group: 'deal', ...assignee(deal.owner),
      date: pastClose ? closeDate : '', time: '', reason: reasons.join(' · '),
    });
  }
  return rows.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')
    || (a.time || '24:00').localeCompare(b.time || '24:00') || a.name.localeCompare(b.name, 'vi'));
}

export function projectTrend(projects: Pick<Project, 'startDate' | 'budget'>[], today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 5 + index, 1));
    return { key: date.toISOString().slice(0, 7), label: 'T' + (date.getUTCMonth() + 1), value: 0, count: 0 };
  });
  const byMonth = new Map(months.map(bucket => [bucket.key, bucket]));
  for (const project of projects) {
    const bucket = byMonth.get(dateOnly(project.startDate).slice(0, 7));
    if (bucket) { bucket.value += project.budget; bucket.count++; }
  }
  return months;
}
