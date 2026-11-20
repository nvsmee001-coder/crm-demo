import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getAccess, getReadAccess } from './access-store';
import { CRMError } from './crm-engine';
import type { AccessContext, Command, Content, CRMIdentity, Workspace } from './crm-types';
import { CONTENT_STATUSES, TASK_STATUSES } from './crm-types';
import { withTransaction } from './database';
import { getWorkspaceRow } from './workspace-tables';
import type { DeliveryContent, DeliveryDashboard, DeliveryIssue, DeliveryProject, DeliveryTask, ProjectAssignment } from './delivery-types';
import { hasPublicationApproval } from './project-progress';

const MAX_PROJECT_MEMBERS=100;
const forbidden=()=>new CRMError('Bạn không có quyền thực hiện thao tác triển khai này.',403);
const completeStatus='Hoàn tất';

// $1 workspace, $2 current member ID, $3 member ID plus legacy display name.
const assignedProjects=`
  SELECT project_id FROM crm_project_members WHERE workspace_id=$1 AND member_id=$2
  UNION SELECT id FROM crm_projects WHERE workspace_id=$1 AND payload->>'owner'=ANY($3::text[])
  UNION SELECT project_id FROM crm_tasks WHERE workspace_id=$1 AND payload->>'owner'=ANY($3::text[])
  UNION SELECT project_id FROM crm_contents WHERE workspace_id=$1 AND payload->>'owner'=ANY($3::text[])
  UNION SELECT project_id FROM crm_issues WHERE workspace_id=$1 AND payload->>'owner'=ANY($3::text[])`;

async function assignmentKeys(client:PoolClient,workspaceId:string,memberId:string) {
  const {rows:[member]}=await client.query<{name:string;legacy:boolean}>(`
    SELECT t.payload->>'name' AS name, NOT EXISTS (
      SELECT 1 FROM crm_team other WHERE other.workspace_id=t.workspace_id AND other.id=t.payload->>'name' AND other.id<>t.id
    ) AS legacy FROM crm_team t WHERE t.workspace_id=$1 AND t.id=$2`,[workspaceId,memberId]);
  if (!member) throw forbidden();
  return member.legacy?[memberId,member.name]:[memberId];
}

function readDeliveryRows<T>(client:PoolClient,table:'crm_tasks'|'crm_contents'|'crm_issues',fields:readonly string[],workspaceId:string,keys:string[]) {
  return client.query<{payload:T}>(`SELECT jsonb_build_object(${fields.map(field=>`'${field}',payload->'${field}'`).join(',')}) AS payload
    FROM ${table} WHERE workspace_id=$1 AND payload->>'owner'=ANY($2::text[]) ORDER BY position`,[workspaceId,keys]);
}

export async function readDeliveryDashboard(identity:CRMIdentity):Promise<DeliveryDashboard> {
  return withTransaction(async client=>{
    const access=await getReadAccess(identity,client);
    if (access.role!=='delivery'||!access.memberId) throw forbidden();
    const workspace=await getWorkspaceRow(client,'live',access,false);
    const keys=await assignmentKeys(client,workspace.id,access.memberId);
    const {rows:[settings]}=await client.query<{name:string;approval:boolean}>(`SELECT payload->'settings'->>'companyName' AS name,
      payload->'settings'->'contentApprovalRequired'='true'::jsonb AS approval FROM crm_company_settings WHERE workspace_id=$1`,[workspace.id]);
    const {rows:projects}=await client.query<{payload:DeliveryProject}>(`WITH assigned(project_id) AS (${assignedProjects})
      SELECT jsonb_build_object('id',p.id,'name',p.payload->>'name','status',p.payload->>'status','startDate',p.payload->>'startDate',
        'dueDate',p.payload->>'dueDate','scope',p.payload->>'scope','customerName',c.payload->>'name') AS payload
      FROM assigned a JOIN crm_projects p ON p.workspace_id=$1 AND p.id=a.project_id
      JOIN crm_customers c ON c.workspace_id=p.workspace_id AND c.id=p.customer_id ORDER BY p.position`,[workspace.id,access.memberId,keys]);
    const tasks=await readDeliveryRows<DeliveryTask>(client,'crm_tasks',['id','projectId','name','status','dueDate','hours','notes','deliveryResult'],workspace.id,keys);
    const contents=await readDeliveryRows<DeliveryContent & Pick<Content,'approvedVersion'|'approvedAt'|'approvalConfirmation'|'publicationReview'>>(
      client,'crm_contents',['id','projectId','title','status','publishDate','channel','batch','body','feedback','url','version','approvedVersion','approvedAt','approvalConfirmation','publicationReview'],workspace.id,keys);
    const issues=await readDeliveryRows<DeliveryIssue>(client,'crm_issues',['id','projectId','title','description','status','dueDate','priority','resolution'],workspace.id,keys);
    return {companyName:settings?.name ?? 'SMEE CRM',contentApprovalRequired:settings?.approval === true,viewer:{name:access.name,email:access.email},revision:workspace.revision,
      projects:projects.map(item=>item.payload),tasks:tasks.rows.map(item=>item.payload),contents:contents.rows.map(({payload:{approvedVersion,approvedAt,approvalConfirmation,publicationReview,...content}})=>({
        ...content,publicationApproved:hasPublicationApproval({version:content.version,approvedVersion,approvedAt,approvalConfirmation}),
        publicationFeedback:publicationReview?.decision==='returned'?publicationReview.reason:undefined,
      })),issues:issues.rows.map(item=>item.payload)};
  });
}

export async function assertDeliveryCommand(client:PoolClient,workspaceId:string,data:Workspace,command:Command,access:AccessContext) {
  if (access.role!=='delivery'||!access.memberId) throw forbidden();
  const member=data.team.find(item=>item.id===access.memberId);
  if (!member) throw forbidden();
  const keys=data.team.some(item=>item.id===member.name&&item.id!==member.id)?[member.id]:[member.id,member.name];
  const fields=command.data;
  if (!fields||typeof fields!=='object'||Array.isArray(fields)) throw forbidden();
  const allowed=(keys:string[])=>Object.keys(fields).length>0&&Object.keys(fields).every(key=>keys.includes(key));
  if (command.action==='create'&&command.collection==='issues'&&!command.id) {
    if (!allowed(['projectId','title','description','priority','dueDate'])||typeof fields.projectId!=='string') throw forbidden();
    if (Object.hasOwn(fields,'priority')&&!['Bình thường','Cao','Khẩn cấp'].includes(String(fields.priority))) throw forbidden();
    const {rowCount}=await client.query(`WITH assigned(project_id) AS (${assignedProjects}) SELECT 1 FROM assigned WHERE project_id=$4`,[workspaceId,member.id,keys,fields.projectId]);
    if (!rowCount) throw forbidden();
    if (typeof fields.description!=='string'||!fields.description.trim()) throw new CRMError('Nhập mô tả vướng mắc.');
    return;
  }
  if (command.action==='resolve_issue') {
    const issue=data.issues.find(item=>item.id===command.id);
    if (!issue||!keys.includes(issue.owner)||!allowed(['resolution'])) throw forbidden();
    return;
  }
  if (command.action!=='update') throw forbidden();
  switch (command.collection) {
    case 'tasks': {
      const task=data.tasks.find(item=>item.id===command.id);
      if (!task||!keys.includes(task.owner)||!allowed(['status','hours','deliveryResult'])) throw forbidden();
      if (Object.hasOwn(fields,'status') && !TASK_STATUSES.includes(String(fields.status))) throw forbidden();
      return;
    }
    case 'contents': {
      const content=data.contents.find(item=>item.id===command.id);
      if (!content||!keys.includes(content.owner)||content.status==='Đã đăng'||!allowed(['body','status'])) throw forbidden();
      if (Object.hasOwn(fields,'status') && (fields.status==='Đã đăng'||!CONTENT_STATUSES.includes(String(fields.status)))) throw forbidden();
      if (fields.status==='Sẵn sàng đăng'&&(Object.hasOwn(fields,'body')||!content.body?.trim())) throw new CRMError('Lưu bản nội dung trước khi đánh dấu sẵn sàng đăng.');
      return;
    }
    case 'issues': {
      const issue=data.issues.find(item=>item.id===command.id);
      if (!issue||!keys.includes(issue.owner)||!allowed(['status'])||
          ['Đã xử lý','Đã giải quyết'].includes(issue.status)||!['Đang xử lý','Đã chuyển cấp'].includes(String(fields.status))) throw forbidden();
      return;
    }
    default: throw forbidden();
  }
}

export async function readProjectAssignees(client:PoolClient,workspaceId:string) {
  const {rows}=await client.query<{id:string;name:string}>(`SELECT t.id,t.payload->>'name' AS name FROM crm_team t
    LEFT JOIN crm_access_accounts a ON a.team_member_id=t.id WHERE t.workspace_id=$1 AND
      ((t.id='member-admin' AND a.id IS NULL) OR (a.active=1 AND a.bound_user_id IS NOT NULL AND a.role IN ('manager','delivery')))
    ORDER BY t.position`,[workspaceId]);
  return rows;
}

async function projectAssignment(client:PoolClient,workspaceId:string,projectId:string,revision:number):Promise<ProjectAssignment> {
  const {rowCount}=await client.query('SELECT id FROM crm_projects WHERE workspace_id=$1 AND id=$2',[workspaceId,projectId]);
  if (!rowCount) throw new CRMError('Không tìm thấy dự án.',404);
  const {rows}=await client.query<{id:string;name:string;assigned:boolean;assignable:boolean}>(`
    SELECT t.id,t.payload->>'name' AS name,(m.member_id IS NOT NULL) AS assigned,
      COALESCE(a.role='delivery' AND a.active=1 AND a.bound_user_id IS NOT NULL,false) AS assignable
    FROM crm_team t LEFT JOIN crm_access_accounts a ON a.team_member_id=t.id
    LEFT JOIN crm_project_members m ON m.workspace_id=t.workspace_id AND m.project_id=$2 AND m.member_id=t.id
    WHERE t.workspace_id=$1 AND (m.member_id IS NOT NULL OR (a.role='delivery' AND a.active=1 AND a.bound_user_id IS NOT NULL))
    ORDER BY t.position`,[workspaceId,projectId]);
  return {revision,members:rows.filter(item=>item.assigned).map(item=>item.id),candidates:rows.map(({id,name,assignable})=>({id,name,assignable}))};
}

function validateProjectId(projectId:string) {
  if (!projectId||projectId.length>120) throw new CRMError('Mã dự án không hợp lệ.');
}

export async function readProjectAssignment(identity:CRMIdentity,projectId:string) {
  validateProjectId(projectId);
  return withTransaction(async client=>{
    const access=await getReadAccess(identity,client);
    if (access.role!=='owner'&&access.role!=='manager') throw forbidden();
    const row=await getWorkspaceRow(client,'live',access,false);
    return projectAssignment(client,row.id,projectId,row.revision);
  });
}

export async function updateProjectAssignment(identity:CRMIdentity,projectId:string,memberIds:unknown,revision:unknown) {
  validateProjectId(projectId);
  if (!Array.isArray(memberIds)||memberIds.length>MAX_PROJECT_MEMBERS||memberIds.some(id=>typeof id!=='string'||!id||id.length>120)||!Number.isSafeInteger(revision)) {
    throw new CRMError('Danh sách người triển khai không hợp lệ.');
  }
  const selected=[...new Set<string>(memberIds)];
  return withTransaction(async client=>{
    const access=await getAccess(identity,client);
    if (access.role!=='owner'&&access.role!=='manager') throw forbidden();
    const row=await getWorkspaceRow(client,'live',access,true);
    const prior=await projectAssignment(client,row.id,projectId,row.revision);
    if (row.revision!==revision) throw new CRMError('Dữ liệu vừa thay đổi. Hãy tải lại danh sách trước khi lưu.',409);
    const allowed=new Set(prior.candidates.filter(candidate=>candidate.assignable).map(candidate=>candidate.id));
    const additions=selected.filter(id=>!prior.members.includes(id));
    if(additions.some(id=>!allowed.has(id))) throw new CRMError('Chỉ thêm người có tài khoản Triển khai đang hoạt động và đã kích hoạt.');
    const removals=prior.members.filter(id=>!selected.includes(id));
    if(!additions.length&&!removals.length) return prior;
    await client.query('DELETE FROM crm_project_members WHERE workspace_id=$1 AND project_id=$2 AND member_id=ANY($3::text[])',[row.id,projectId,removals]);
    await client.query(`INSERT INTO crm_project_members(workspace_id,project_id,member_id,assigned_by)
      SELECT $1,$2,id,$4 FROM unnest($3::text[]) id`,[row.id,projectId,additions,identity.userId]);
    const next=row.revision+1;
    const time=new Date().toISOString();
    await client.query('UPDATE crm_workspaces SET revision=$1,updated_at=$2 WHERE id=$3',[next,time,row.id]);
    const id=randomUUID();
    await client.query('INSERT INTO crm_activities(workspace_id,id,last_revision,payload) VALUES ($1,$2,$3,$4)',[row.id,id,next,JSON.stringify({
      id,kind:'set_project_members',text:'Cập nhật nhóm triển khai',entityId:projectId,time,actor:identity.displayName,
      details:{members:{before:prior.members,after:selected}},
    })]);
    return projectAssignment(client,row.id,projectId,next);
  });
}

export async function deliveryCanReadContentFile(identity:CRMIdentity,fileId:string,origin:string) {
  return withTransaction(async client=>{
    const access=await getReadAccess(identity,client);
    if(access.role!=='delivery'||!access.memberId) return false;
    const row=await getWorkspaceRow(client,'live',access,false);
    const keys=await assignmentKeys(client,row.id,access.memberId);
    const {rows}=await client.query<{url:string}>(`SELECT payload->>'url' AS url FROM crm_contents WHERE workspace_id=$1 AND payload->>'owner'=ANY($2::text[])
      AND (split_part(payload->>'url','/',4)=$3 OR split_part(payload->>'url','/',6)=$3)`,[row.id,keys,fileId]);
    const canonical=new URL(origin).origin;
    return rows.some(({url})=>{
      try {
        const link=new URL(url,canonical);
        const [,api,uploads,id]=link.pathname.split('/');
        return link.origin===canonical&&api==='api'&&uploads==='uploads'&&id===fileId;
      } catch {return false;}
    });
  });
}
