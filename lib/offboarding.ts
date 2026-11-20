import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getReadAccess, requireOwner, type AccountRow } from './access-store';
import { lockPasswordProof, verifyCurrentPassword } from './auth/credential-proof';
import { CRMError } from './crm-error';
import type { AccessContext, CRMIdentity, Workspace } from './crm-types';
import { withTransaction } from './database';
import type { HandoverChoice, HandoverPreview, HandoverRecipient, HandoverSection } from './offboarding-types';
import { getWorkspaceRow, readWorkspaceRecords, saveWorkspaceRecords } from './workspace-tables';

const recipients=['sales','telesales','followUps','delivery'] as const;
const activeQueue=new Set(['Chờ gọi','Đang chăm sóc','Hẹn gọi lại','Đủ điều kiện']);
const manages=(choice:HandoverChoice)=>choice.role==='owner'||choice.role==='manager';

function validate(ok:unknown,message:string,status=400):asserts ok {
  if (!ok) throw new CRMError(message,status);
}

async function readTarget(db:PoolClient,accountId:unknown) {
  validate(typeof accountId==='string' && accountId.length>0 && accountId.length<=100,'Chọn tài khoản hợp lệ.');
  const {rows:[account]}=await db.query<AccountRow>('SELECT * FROM crm_access_accounts WHERE id=$1',[accountId]);
  validate(account,'Không tìm thấy tài khoản nhân sự.',404);
  return account;
}

async function collectWork(db:PoolClient,workspaceId:string,source:Workspace,account:AccountRow,access:AccessContext) {
  const departing=source.team.find(member=>member.id===account.team_member_id);
  const name=departing?.name;
  const legacyName=name && source.team.filter(member=>member.name===name).length===1 &&
    !source.team.some(member=>member.id!==departing?.id && member.id===name) ? name : undefined;
  const matches=(value:string|undefined)=>value===account.team_member_id || (!!legacyName && value===legacyName);
  const customers=source.customers.filter(customer=>matches(customer.owner));
  const customerIds=new Set(customers.map(customer=>customer.id));
  const customerById=new Map(source.customers.map(customer=>[customer.id,customer]));
  const deals=source.deals.filter(deal=>matches(deal.owner) && !['Đã chốt','Không thành công'].includes(deal.stage));
  const queues=source.customers.filter(customer=>matches(customer.telesalesOwner) && activeQueue.has(customer.telesalesStatus||''));
  const queueIds=new Set(queues.map(customer=>customer.id));
  const handoffs=source.customers.filter(({salesHandoff:handoff})=>handoff && !handoff.resolution &&
    (handoff.fromMemberId===account.team_member_id || handoff.toMemberId===account.team_member_id));
  const followUps=source.customers.flatMap(customer=>(customer.actions||[])
    .filter(action=>action.status==='Cần làm' && matches(action.owner))
    .map(action=>({action,customer,group:customerIds.has(customer.id)?'sales':
      queueIds.has(customer.id)?'telesales':'followUps'} as const)));
  const openProjects=source.projects.filter(project=>project.status!=='Hoàn tất');
  const openProjectNames=new Map(openProjects.map(project=>[project.id,project.name]));
  const projects=openProjects.filter(project=>matches(project.owner));
  const tasks=source.tasks.filter(task=>matches(task.owner) && task.status!=='Hoàn tất' && openProjectNames.has(task.projectId));
  const contents=source.contents.filter(content=>matches(content.owner) && content.status!=='Đã đăng' && openProjectNames.has(content.projectId));
  const issues=source.issues.filter(issue=>matches(issue.owner) && !['Đã xử lý','Đã giải quyết'].includes(issue.status) && openProjectNames.has(issue.projectId));
  const memberships=(await db.query<{project_id:string}>(`SELECT project_id FROM crm_project_members
    WHERE workspace_id=$1 AND member_id=$2 ORDER BY project_id`,[workspaceId,account.team_member_id])).rows
    .map(row=>row.project_id).filter(id=>openProjectNames.has(id));
  const accounts=(await db.query<Pick<AccountRow,'team_member_id'|'role'>>(`SELECT team_member_id,role FROM crm_access_accounts
    WHERE id<>$1 AND active=1 AND bound_user_id IS NOT NULL`,[account.id])).rows;
  const availableRoles=new Map<string,HandoverChoice['role']>(accounts.map(item=>[item.team_member_id,item.role]));
  availableRoles.set('member-admin','owner');
  const staff=source.team.flatMap(member=>{
    const role=availableRoles.get(member.id);
    return role && member.id!==account.team_member_id ? [{id:member.id,name:member.name,role}] : [];
  });
  const choices: HandoverPreview['choices'] = {
    sales:staff.filter(choice=>manages(choice) || (choice.role==='account' &&
      deals.every(deal=>customerIds.has(deal.customerId) || customerById.get(deal.customerId)?.owner===choice.id))),
    telesales:staff.filter(choice=>choice.role==='telesales'),
    followUps:staff.filter(manages),
    delivery:staff.filter(choice=>choice.role==='delivery' || (!memberships.length && manages(choice))),
  };
  const labels:Record<HandoverSection,string[]>={
    sales:[...customers.map(item=>'Khách hàng · '+item.name),...deals.map(item=>'Cơ hội · '+item.name)],
    telesales:queues.map(item=>item.name),
    followUps:[],
    delivery:[...projects.map(item=>'Dự án · '+item.name),...tasks.map(item=>'Việc · '+item.name),
      ...contents.map(item=>'Nội dung · '+item.title),...issues.map(item=>'Vướng mắc · '+item.title),
      ...memberships.map(id=>'Thành viên dự án · '+openProjectNames.get(id))],
    handoffs:handoffs.map(item=>item.name),
  };
  for (const {action,customer,group} of followUps) labels[group].push('Lịch chăm sóc · '+customer.name+' · '+action.title);
  const work=Object.fromEntries(Object.entries(labels).map(([key,values])=>
    [key,{count:values.length,examples:values.slice(0,8)}])) as HandoverPreview['work'];

  function transfer(before:Workspace, selected:Partial<Record<HandoverRecipient,string>>, reason:string, now:string) {
    const after=structuredClone(before);
    const dealIds=new Set(deals.map(item=>item.id));
    const projectIds=new Set(projects.map(item=>item.id));
    const taskIds=new Set(tasks.map(item=>item.id));
    const contentIds=new Set(contents.map(item=>item.id));
    const issueIds=new Set(issues.map(item=>item.id));
    const handoffIds=new Set(handoffs.map(item=>item.id));
    const followUpGroups=new Map<string,Map<string,HandoverRecipient>>();
    for (const {customer,action,group} of followUps) {
      if (!followUpGroups.has(customer.id)) followUpGroups.set(customer.id,new Map());
      followUpGroups.get(customer.id)!.set(action.id,group);
    }
    for (const customer of after.customers) {
      if (customerIds.has(customer.id)) { customer.owner=selected.sales!; customer.updatedAt=now; }
      if (queueIds.has(customer.id)) { customer.telesalesOwner=selected.telesales!; customer.updatedAt=now; }
      if (handoffIds.has(customer.id) && customer.salesHandoff) {
        customer.salesHandoff.resolution={id:access.userId,name:access.name,at:now,decision:'cancelled',reason};
        customer.updatedAt=now;
      }
      const assigned=followUpGroups.get(customer.id);
      for (const action of customer.actions||[]) {
        const group=assigned?.get(action.id);
        if (group) { action.owner=selected[group]!; action.updatedAt=now; customer.updatedAt=now; }
      }
    }
    for (const item of after.deals) if (dealIds.has(item.id)) item.owner=selected.sales!;
    for (const item of after.projects) if (projectIds.has(item.id)) item.owner=selected.delivery!;
    for (const item of after.tasks) if (taskIds.has(item.id)) item.owner=selected.delivery!;
    for (const item of after.contents) if (contentIds.has(item.id)) item.owner=selected.delivery!;
    for (const item of after.issues) if (issueIds.has(item.id)) item.owner=selected.delivery!;
    return after;
  }
  return {work,choices,memberships,transfer};
}

export async function previewOffboarding(identity:CRMIdentity,accountId:unknown):Promise<HandoverPreview> {
  return withTransaction(async db=>{
    const access=await getReadAccess(identity,db);
    validate(access.role==='owner','Chức năng này chỉ dành cho chủ sở hữu.',403);
    const account=await readTarget(db,accountId);
    const row=await getWorkspaceRow(db,'live',access,false);
    const source=await readWorkspaceRecords(db,row.id);
    const { work,choices }=await collectWork(db,row.id,source,account,access);
    return {active:account.active===1,accessRevision:access.controlRevision!,workspaceRevision:row.revision,work,choices};
  });
}

export async function offboard(identity:CRMIdentity,input:Record<string,unknown>) {
  const move=input.action==='transfer';
  validate(move || input.action==='lock','Chọn cách xử lý tài khoản.');
  const reason=typeof input.reason==='string'?input.reason.trim():'';
  validate(reason && reason.length<=500,'Nhập lý do từ 1 đến 500 ký tự.');
  const access=await getReadAccess(identity);
  validate(access.role==='owner','Chức năng này chỉ dành cho chủ sở hữu.',403);
  const proof=await verifyCurrentPassword(identity.userId,input.password);
  return withTransaction(async db=>{
    const owner=await requireOwner(identity,db);
    await lockPasswordProof(db,proof);
    const account=await readTarget(db,input.accountId);
    validate(input.accessRevision===owner.controlRevision,'Danh sách tài khoản đã thay đổi. Hãy tải lại bản xem trước.',409);
    const selected:Partial<Record<HandoverRecipient,string>>={};
    let counts:Partial<Record<HandoverSection,number>>={};
    const now=new Date().toISOString();
    if (move) {
      const row=await getWorkspaceRow(db,'live',owner,true);
      validate(input.workspaceRevision===row.revision,'Công việc vừa thay đổi. Hãy tải lại bản xem trước.',409);
      const source=await readWorkspaceRecords(db,row.id);
      const { work,choices,memberships,transfer }=await collectWork(db,row.id,source,account,owner);
      const assignment=(input.recipients && typeof input.recipients==='object'?input.recipients:{}) as Record<string,unknown>;
      for (const group of recipients) {
        if (!work[group].count) continue;
        const choice=choices[group].find(item=>item.id===assignment[group]);
        validate(choice,'Chọn người đang có đủ quyền tiếp nhận cho từng nhóm việc.');
        selected[group]=choice.id;
      }
      counts=Object.fromEntries(Object.entries(work).map(([group,section])=>[group,section.count]));
      validate(Object.values(counts).some(count=>count>0),'Tài khoản không còn việc tồn để bàn giao.',409);
      await saveWorkspaceRecords(db,row,source,transfer(source,selected,reason,now));
      if (memberships.length) {
        await db.query('DELETE FROM crm_project_members WHERE workspace_id=$1 AND member_id=$2 AND project_id=ANY($3::text[])',
          [row.id,account.team_member_id,memberships]);
        await db.query(`INSERT INTO crm_project_members(workspace_id,project_id,member_id,assigned_by)
          SELECT $1,project_id,$3,$4 FROM unnest($2::text[]) AS p(project_id) ON CONFLICT DO NOTHING`,
          [row.id,memberships,selected.delivery,identity.userId]);
      }
    } else validate(account.active===1,'Tài khoản đã bị khóa.',409);
    await db.query('UPDATE crm_access_accounts SET active=0,version=version+1,updated_at=$2 WHERE id=$1',[account.id,now]);
    await db.query(`UPDATE crm_access_control SET revision=revision+1,mutation_id=$1,updated_at=$2 WHERE id='company'`,[randomUUID(),now]);
    await db.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE id=$1 OR email=$2)',[account.bound_user_id,account.email]);
    await db.query('DELETE FROM auth_setup_tokens WHERE crm_account_id=$1',[account.id]);
    await db.query(`INSERT INTO crm_access_audit(id,actor_id,actor_email,action,target_id,details,at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),identity.userId,identity.email,move?'offboarding':'account_disabled',account.id,
      JSON.stringify({after:{email:account.email,active:false},counts,recipients:selected,reason}),now]);
    return {transferred:Object.values(counts).reduce((sum,count)=>sum+count,0)};
  });
}
