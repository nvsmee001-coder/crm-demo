import { COLLECTION_ACTIONS } from './crm-types.js';
import type { AccessRole, Action, CollectionAction, Project, ProjectLedger } from './crm-types.js';

export function isCollectionAction(action: Action): action is CollectionAction {
  return COLLECTION_ACTIONS.some(candidate => candidate === action);
}

export function canWriteCollections(action: CollectionAction, role?: AccessRole) {
  if (role === 'owner') return true;
  if (role === 'finance') return action === 'record_project_receipt' || action === 'request_receipt_correction';
  return role === 'manager' && (action === 'request_legacy_contract_change' || action === 'review_legacy_contract_change');
}

export const documentKey = (value: string) => value.trim().normalize('NFKC').toLowerCase();

export function collected(ledger: ProjectLedger): number {
  return ledger.receipts.reduce((sum, receipt) => sum + (receipt.voided ? 0 : receipt.amount), 0);
}

type BalanceProject = Pick<Project,'budget'|'ledger'>;

export function projectBalance(project: BalanceProject, today: string) {
  if (!project.ledger) return undefined;
  const paid = collected(project.ledger);
  const outstanding = project.budget - paid;
  const overdue = outstanding > 0 && Boolean(project.ledger.paymentDue) && project.ledger.paymentDue < today;
  return { paid, outstanding, overdue };
}

export function collectionTotals(projects: BalanceProject[], today: string) {
  const totals = { paid: BigInt(0), outstanding: BigInt(0), overdue: BigInt(0), tracked: 0, lateCount: 0, missingDue: 0 };
  for (const project of projects) {
    const balance = projectBalance(project, today);
    if (!balance) continue;
    totals.tracked++;
    totals.paid += BigInt(balance.paid);
    totals.outstanding += BigInt(balance.outstanding);
    if (balance.outstanding > 0 && !project.ledger?.paymentDue) totals.missingDue++;
    if (balance.overdue) {
      totals.lateCount++;
      totals.overdue += BigInt(balance.outstanding);
    }
  }
  return totals;
}
