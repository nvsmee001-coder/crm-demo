import { SALES_HANDOFF_ACTIONS, type AccessViewer, type Command, type SalesHandoffAction, type SalesHandoffRow, type Workspace } from './crm-types.js';

const actions = new Set<Command['action']>(SALES_HANDOFF_ACTIONS);
export function isSalesHandoffAction(action: Command['action']): action is SalesHandoffAction {
  return actions.has(action);
}

export function salesHandoffQueue(workspace: Workspace, viewer: Pick<AccessViewer,'role'|'memberId'>): SalesHandoffRow[] {
  const management = viewer.role === 'owner' || viewer.role === 'manager';
  const items: SalesHandoffRow[] = [];
  for (const customer of workspace.customers) {
    const handoff = customer.salesHandoff;
    if (!handoff || !(management || (viewer.role === 'telesales' && handoff.fromMemberId === viewer.memberId) ||
      (viewer.role === 'account' && handoff.toMemberId === viewer.memberId))) continue;
    const { requested, resolution, ...summary } = handoff;
    items.push({
      ...summary, customerId:customer.id, requestedAt:requested.at,
      resolution:resolution && {decision:resolution.decision, reason:resolution.reason, name:resolution.name, at:resolution.at},
    });
  }
  return items.sort((a,b)=>Number(Boolean(a.resolution))-Number(Boolean(b.resolution)) || a.dueDate.localeCompare(b.dueDate) || b.requestedAt.localeCompare(a.requestedAt));
}
