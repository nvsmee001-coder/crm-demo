import { getReadAccess } from './access-store';
import { CRMError } from './crm-error';
import type { CRMIdentity } from './crm-types';
import { withTransaction } from './database';
import type { AccountProjectProgress } from './project-progress';
import { getWorkspaceRow } from './workspace-tables';

export async function readAccountProjects(identity:CRMIdentity, customerId:string) {
  if (!customerId || customerId.length > 120) throw new CRMError('Hồ sơ không có trong phạm vi của bạn.',404);
  return withTransaction(async client=>{
    const access=await getReadAccess(identity,client);
    if (access.role!=='account' || !access.memberId) throw new CRMError('Chức năng dành cho tài khoản Sale/Account.',403);
    const row=await getWorkspaceRow(client,'live',access,false);
    const record=await client.query('SELECT 1 FROM crm_customers WHERE workspace_id=$1 AND id=$2 AND owner_id=$3',[row.id,customerId,access.memberId]);
    if (!record.rowCount) throw new CRMError('Hồ sơ không có trong phạm vi của bạn.',404);
    const result=await client.query<AccountProjectProgress>(`
      SELECT p.id,p.payload->>'name' AS name,p.payload->>'status' AS status,p.payload->>'dueDate' AS "dueDate",
        p.payload->'acceptanceRecord'->'actor'->>'at' AS "acceptedAt", task_counts.total AS "tasksTotal",
        jsonb_build_object('tasks',task_counts.pending,'contents',content_counts.pending,'issues',issue_counts.pending) AS "open"
      FROM crm_projects p
      CROSS JOIN LATERAL (SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE payload->>'status' IS DISTINCT FROM 'Hoàn tất')::int AS pending
        FROM crm_tasks WHERE workspace_id=p.workspace_id AND project_id=p.id) task_counts
      CROSS JOIN LATERAL (SELECT COUNT(*)::int AS pending FROM crm_contents
        WHERE workspace_id=p.workspace_id AND project_id=p.id AND payload->>'status' IS DISTINCT FROM 'Đã đăng') content_counts
      CROSS JOIN LATERAL (SELECT COUNT(*)::int AS pending FROM crm_issues
        WHERE workspace_id=p.workspace_id AND project_id=p.id AND COALESCE(payload->>'status','') NOT IN ('Đã xử lý','Đã giải quyết')) issue_counts
      WHERE p.workspace_id=$1 AND p.customer_id=$2 ORDER BY (p.payload->>'status' = 'Hoàn tất'),p.payload->>'dueDate',p.id`,[row.id,customerId]);
    return {projects:result.rows};
  });
}
