import type { CRMResponse, Customer, CustomerAction, Workspace } from './crm-types.js';

export type AgendaViewer = Pick<CRMResponse['user'], 'role' | 'memberId'>;
export type AgendaPeriod = 'all' | 'due' | 'nextWeek';
export interface AgendaItem {
  id: string;
  customerId: string;
  customerName: string;
  kind: 'Chăm sóc' | CustomerAction['type'];
  title: string;
  date: string;
  time: string;
  assigneeId: string;
  assigneeName: string;
}

const activeCalls = new Set(['Chờ gọi', 'Đang chăm sóc', 'Hẹn gọi lại']);
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const localTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function agendaClock(now: Date) {
  const today = localDate.format(now);
  const lastDay = new Date(today + 'T00:00:00Z');
  lastDay.setUTCDate(lastDay.getUTCDate() + 7);
  return { today, time: localTime.format(now), weekEnd: lastDay.toISOString().slice(0, 10) };
}

export function dateOnly(value?: string) {
  const date = value?.slice(0, 10) || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date ? date : '';
}

export function activeTelesalesOwner(customer: Customer) {
  return customer.telesalesOwner && activeCalls.has(customer.telesalesStatus || '') ? customer.telesalesOwner : '';
}

export function buildAgenda(data: Pick<Workspace, 'customers' | 'team'>, viewer?: AgendaViewer): AgendaItem[] {
  const isStaff = viewer?.role === 'account' || viewer?.role === 'telesales';
  if (isStaff && !viewer.memberId) return [];
  const people = new Map(data.team.map(member => [member.name, member]));
  for (const member of data.team) people.set(member.id, member);
  const assignee = (value: string) => ({
    assigneeId: people.get(value)?.id || value,
    assigneeName: people.get(value)?.name || value || 'Chưa phân công',
  });
  const items: AgendaItem[] = [];
  for (const customer of data.customers) {
    if (isStaff && (viewer.role === 'telesales' ? customer.telesalesOwner : customer.owner) !== viewer.memberId) continue;
    const customerInfo = { customerId: customer.id, customerName: customer.name };
    const activeTele = activeTelesalesOwner(customer);
    const followUp = dateOnly(customer.nextFollowUp);
    const followUpOwner = activeTele || customer.owner;
    if (followUp && !['Tạm ngừng', 'Không phù hợp'].includes(customer.status)
      && (!isStaff || (followUpOwner === viewer.memberId && (viewer.role !== 'telesales' || activeTele)))) {
      items.push({
        id: 'follow-up/' + encodeURIComponent(customer.id), ...customerInfo, kind: 'Chăm sóc',
        title: customer.nextAction?.trim() || 'Liên hệ lại', date: followUp, time: '', ...assignee(followUpOwner),
      });
    }
    for (const action of customer.actions || []) {
      if (action.status !== 'Cần làm' || (isStaff && action.owner !== viewer.memberId)) continue;
      const date = dateOnly(action.dueDate);
      if (!date) continue;
      items.push({
        id: 'action/' + encodeURIComponent(customer.id) + '/' + encodeURIComponent(action.id), ...customerInfo,
        kind: action.type, title: action.title, date,
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(action.time || '') ? action.time! : '',
        ...assignee(action.owner),
      });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)
    || (a.time || '24:00').localeCompare(b.time || '24:00')
    || a.customerName.localeCompare(b.customerName, 'vi') || a.id.localeCompare(b.id));
}

export function isLate(item: AgendaItem, clock: ReturnType<typeof agendaClock>) {
  return item.date < clock.today || (item.date === clock.today && !!item.time && item.time < clock.time);
}

export function matchesPeriod(item: AgendaItem, period: AgendaPeriod, clock: ReturnType<typeof agendaClock>) {
  if (period === 'due') return item.date <= clock.today;
  if (period === 'nextWeek') return item.date > clock.today && item.date <= clock.weekEnd;
  return true;
}

function calendarText(value: string) {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/([;,])/g, '\\$1');
}

// A folded line may use 75 UTF-8 bytes including its continuation space.
function foldLine(line: string) {
  const encoder = new TextEncoder();
  let output = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { output += '\r\n '; bytes = 1; }
    output += char;
    bytes += size;
  }
  return output;
}

const utcStamp = (date: Date) => date.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';

export function agendaCalendar(items: AgendaItem[], now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SMEE//CRM//VI', 'CALSCALE:GREGORIAN'];
  const stamped = utcStamp(now);
  for (const item of items) {
    const start = item.time
      ? 'DTSTART:' + utcStamp(new Date(item.date + 'T' + item.time + ':00+07:00'))
      : 'DTSTART;VALUE=DATE:' + item.date.replaceAll('-', '');
    lines.push('BEGIN:VEVENT', 'UID:' + item.id + '@smee-crm', 'DTSTAMP:' + stamped, start,
      'SUMMARY:' + calendarText(item.customerName + ' · ' + item.title),
      'DESCRIPTION:' + calendarText(item.kind + ' · ' + item.assigneeName),
      'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
