import { getReadAccess } from './access-store';
import { CRMError } from './crm-error';
import type { AccessContext, CRMIdentity, Project, Workspace } from './crm-types';
import { withTransaction } from './database';
import type { CollectionsProject, FinanceDashboard } from './finance-types';
import { getWorkspaceRow } from './workspace-tables';

type FinanceRow = Pick<Project,'id'|'name'|'customerId'|'budget'|'contract'|'ledger'> & {customerName:string};

function dashboard(rows: FinanceRow[], revision:number, access:AccessContext):FinanceDashboard {
  const customers = new Map<string,string>();
  const projects = rows.map(({id,name,customerId,customerName,budget,contract,ledger}):CollectionsProject=>{
    customers.set(customerId,customerName);
    return {id,name,customerId,budget,ledger:ledger ?? undefined,contract:contract && {number:contract.number,source:contract.source}};
  });
  return {data:{projects,customers:[...customers].map(([id,name])=>({id,name}))},revision,viewer:{name:access.name,email:access.email}};
}

export function projectFinanceDashboard(data: Workspace, revision:number, access:AccessContext) {
  const customers = new Map(data.customers.map(customer=>[customer.id,customer.name]));
  return dashboard(data.projects.filter(project=>project.contract).map(project=>({...project,customerName:customers.get(project.customerId) ?? ''})),revision,access);
}

export async function readFinanceDashboard(identity: CRMIdentity) {
  return withTransaction(async client=>{
    const access = await getReadAccess(identity,client);
    if (access.role !== 'finance') throw new CRMError('Chức năng dành cho tài khoản Tài chính.',403);
    const workspace = await getWorkspaceRow(client,'live',access,false);
    const {rows} = await client.query<FinanceRow>(`
      SELECT p.id,p.payload->>'name' AS name,p.customer_id AS "customerId",p.payload->'budget' AS budget,
        p.payload->'contract' AS contract,c.payload->>'name' AS "customerName",
        l.payload || jsonb_build_object('receipts',COALESCE((
          SELECT jsonb_agg(r.payload ORDER BY r.position DESC,r.id) FROM crm_project_receipts r
          WHERE r.workspace_id=p.workspace_id AND r.parent_id=p.id
        ),'[]'::jsonb)) AS ledger
      FROM crm_projects p JOIN crm_customers c ON c.workspace_id=p.workspace_id AND c.id=p.customer_id
      LEFT JOIN crm_project_ledgers l ON l.workspace_id=p.workspace_id AND l.id=p.id
      WHERE p.workspace_id=$1 AND jsonb_typeof(p.payload->'contract')='object'
      ORDER BY p.position,p.id`,[workspace.id]);
    return dashboard(rows,workspace.revision,access);
  });
}
