import type { PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { withTransaction } from './database';
import type { AccessContext, Command, CRMIdentity, CRMResponse, Workspace, WorkspaceScope } from './crm-types';
import { applyCommand, CRMError, normalizeWorkspace, previewProspectImport } from './crm-engine';
import { demoEnabled } from './demo-config';
import { getAccess, getReadAccess } from './access-store';
import { authorizeCommand, projectWorkspace, eligibleTelesalesAccounts, type TelesalesRecipientAccount } from './crm-access';
import { customerWorkspace, getWorkspaceRow, readCustomerWorkspace, readWorkspaceRecords, recordUnchangedSince, saveWorkspaceRecords, type WorkspaceRow } from './workspace-tables';
import { assertDeliveryCommand, readProjectAssignees } from './delivery-store';
import { isSalesAction } from './sales-workflow';
import { isSalesHandoffAction, salesHandoffQueue } from './sales-handoff';
import { projectFinanceDashboard } from './finance-store';
import type { FinanceDashboard } from './finance-types';
import { isCollectionAction } from './project-collections';

const replayableActions = new Set<Command['action']>(['win_deal','import_customers','import_prospects','complete_project','reopen_project','review_content_publication']);
const requestIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const instanceId=randomUUID();
function spaceId(mode:'demo'|'live') { return `smee:${mode}`; }
function assertWorkspaceEnabled(mode: 'demo'|'live') {
  if (mode === 'demo' && !demoEnabled()) throw new CRMError('Dữ liệu mẫu đã tắt trên máy chủ này.', 403);
}
function workspaceTag(mode:'demo'|'live',row:Pick<WorkspaceRow,'revision'|'updated_at'>,access:AccessContext,scope:WorkspaceScope) {
  const fields=[instanceId,mode,scope,row.revision,row.updated_at,access.ownerId,access.userId,access.name,access.email,access.role,access.memberId,access.accountVersion,access.controlRevision];
  return 'W/"'+createHash('sha256').update(JSON.stringify(fields)).digest('base64url')+'"';
}

async function rawWorkspace(mode:'demo'|'live',access:AccessContext,client:PoolClient,lock=false):Promise<{row:WorkspaceRow;data:Workspace}> {
  if (access.role!=='owner' && mode!=='live') throw new CRMError('Tài khoản nhân viên chỉ sử dụng không gian Làm việc thật.',403);
  const row=await getWorkspaceRow(client,mode,access,lock);
  return {row,data:normalizeWorkspace(await readWorkspaceRecords(client,row.id))};
}
async function recipientAccounts(data:Workspace,client:PoolClient):Promise<TelesalesRecipientAccount[]> {
  // The company row lock acquired by getAccess is held until commit. Account
  // changes also take that lock, so recipient eligibility cannot race this write.
  const result=await client.query<TelesalesRecipientAccount>("SELECT id,team_member_id,role,active,version FROM crm_access_accounts WHERE role='telesales' AND active=1 ORDER BY id");
  return eligibleTelesalesAccounts(data,result.rows);
}

async function salesAssignees(data:Workspace,client:PoolClient) {
  const {rows} = await client.query<{team_member_id:string}>("SELECT team_member_id FROM crm_access_accounts WHERE role='account' AND active=1 AND bound_user_id IS NOT NULL");
  const eligible = new Set(rows.map(account=>account.team_member_id));
  return data.team.filter(member=>eligible.has(member.id)).map(({id,name})=>({id,name}));
}

async function response(data:Workspace,revision:number,mode:'demo'|'live',access:AccessContext,client:PoolClient,scope:WorkspaceScope):Promise<CRMResponse> {
  const result:CRMResponse={data:scope==='customers'?customerWorkspace(data):projectWorkspace(data,access),revision,mode,scope,user:{name:access.name,email:access.email,role:access.role,memberId:access.memberId}};
  if (access.role==='owner' || access.role==='manager') {
    const eligible=mode==='demo' ? new Set(data.team.map(member=>member.id)) : new Set((await recipientAccounts(data,client)).map(account=>account.team_member_id));
    result.telesalesAssignees=data.team.filter(member=>eligible.has(member.id)).map(member=>({id:member.id,name:member.name}));
    if (scope==='full') result.projectAssignees=mode==='demo'?data.team.map(({id,name})=>({id,name})):await readProjectAssignees(client,spaceId(mode));
  }
  if (mode === 'live' && scope === 'full') {
    result.salesHandoffs = salesHandoffQueue(data,access);
    if (access.role !== 'account') result.salesAssignees = await salesAssignees(data,client);
  }
  return result;
}
function assertScope(mode:'demo'|'live',access:AccessContext,scope:WorkspaceScope) {
  if (access.role==='delivery') throw new CRMError('Hãy sử dụng không gian Triển khai.',403);
  if (access.role==='finance') throw new CRMError('Hãy sử dụng không gian Tài chính.',403);
  if (scope==='customers' && (mode!=='live' || !['owner','manager'].includes(access.role))) throw new CRMError('Bạn không có quyền sử dụng màn hình quản lý khách hàng.',403);
}

export async function readWorkspace(mode:'demo'|'live',identity:CRMIdentity,previousTag:string|null=null,scope:WorkspaceScope='full') {
  assertWorkspaceEnabled(mode);
  return withTransaction(async client=>{
    const access=await getReadAccess(identity,client);
    assertScope(mode,access,scope);
    if(previousTag && (mode==='live' || access.role==='owner')) {
      const meta=(await client.query<Pick<WorkspaceRow,'revision'|'updated_at'>>('SELECT revision,updated_at FROM crm_workspaces WHERE id=$1 AND owner_id=$2',[spaceId(mode),access.ownerId])).rows[0];
      if(meta && previousTag===workspaceTag(mode,meta,access,scope))return {tag:previousTag,body:null};
    }
    if (scope==='customers') {
      const row=await getWorkspaceRow(client,mode,access,false);
      const data=await readCustomerWorkspace(client,row.id);
      return {tag:workspaceTag(mode,row,access,scope),body:await response(data,row.revision,mode,access,client,scope)};
    }
    const {row,data}=await rawWorkspace(mode,access,client);
    return {tag:workspaceTag(mode,row,access,scope),body:await response(data,row.revision,mode,access,client,scope)};
  });
}
export async function loadWorkspace(mode:'demo'|'live',identity:CRMIdentity):Promise<CRMResponse> {
  return (await readWorkspace(mode,identity)).body!;
}
export async function previewStaffExcel(identity:CRMIdentity,rows:unknown) {
  return withTransaction(async client=>{
    const access=await getReadAccess(identity,client);
    if(access.role!=='account' && access.role!=='telesales')throw new CRMError('Chỉ nhân viên Sale/Account hoặc Telesales được nhập khách tự khai thác.',403);
    const {row,data}=await rawWorkspace('live',access,client);
    return {revision:row.revision,rows:previewProspectImport(rows,data,access)};
  });
}

async function validateNewWorkAssignments(before: Workspace, after: Workspace, command: Command, client: PoolClient) {
  const assignmentActions = ['upsert_customer_action', 'handoff_customer', 'bulk_update_customers', 'transfer_to_telesales', 'distribute_customers', 'respond_sales_handoff'];
  if (!assignmentActions.includes(command.action) && !(command.action === 'update' && command.collection === 'customers' && command.data && 'owner' in command.data)) return;
  const oldCustomers = new Map(before.customers.map(customer => [customer.id, customer]));
  const changed = after.customers.flatMap(customer => {
    const old = oldCustomers.get(customer.id);
    if (!old || !customer.actions?.length) return [];
    const previous = new Map((old.actions || []).map(action => [action.id, action.owner]));
    return customer.actions.filter(action => action.status === 'Cần làm' && (
      previous.get(action.id) !== action.owner || (command.action === 'upsert_customer_action' && customer.id === command.id && action.id === command.data?.actionId)
    )).map(action => ({customer, owner: action.owner}));
  });
  if (!changed.length) return;
  const ids = [...new Set(changed.map(item => item.owner))];
  const accounts = (await client.query<TelesalesRecipientAccount & {bound_user_id:string|null}>(
    'SELECT team_member_id, role, active, bound_user_id FROM crm_access_accounts WHERE team_member_id=ANY($1::text[])', [ids],
  )).rows;
  const byMember = new Map(accounts.map(account => [account.team_member_id, account]));
  for (const {customer, owner} of changed) {
    const account = byMember.get(owner);
    const role = account?.active === 1 && account.bound_user_id ? account.role : undefined;
    const allowed = role === 'manager' || (role === 'account' && customer.owner === owner) ||
      (role === 'telesales' && customer.telesalesOwner === owner) || (owner === 'member-admin' && !account);
    if (!allowed) throw new CRMError(`Người nhận việc của ${customer.name} cần có tài khoản đã kích hoạt và quyền xem hồ sơ.`, 400);
  }
}

async function validateProjectAssignment(data:Workspace,workspaceId:string,command:Command,client:PoolClient) {
  const {action,collection}=command;
  if (!command.data||!Object.hasOwn(command.data,'owner')) return;
  if (action!=='handoff'&&!((action==='create'||action==='update')&&collection&&['projects','tasks','contents','issues'].includes(collection))) return;
  const previous=action==='handoff'?data.projects.find(item=>item.id===command.id):
    action==='update'&&collection?(data[collection] as {id:string;owner?:string}[]).find(item=>item.id===command.id):undefined;
  const findMember=(key:unknown)=>data.team.find(item=>item.id===key)??data.team.find(item=>item.name===key);
  const recipient=findMember(command.data.owner);
  if (recipient&&recipient.id===findMember(previous?.owner)?.id) return;
  const eligible=await readProjectAssignees(client,workspaceId);
  if (!eligible.some(item=>item.id===recipient?.id)) throw new CRMError('Chọn người có quyền Triển khai hoặc Quản lý đã kích hoạt, hoặc Chủ sở hữu.');
}

export function mutateWorkspace(mode:'demo'|'live',identity:CRMIdentity,command:Command,scope:WorkspaceScope='full') {
  return writeWorkspace(mode,identity,command,scope);
}

export function mutateDeliveryWorkspace(identity:CRMIdentity,command:Command) {
  return writeWorkspace('live',identity,command,'delivery');
}

export function mutateFinanceWorkspace(identity:CRMIdentity,command:Command) {
  return writeWorkspace('live',identity,command,'finance');
}

function writeWorkspace(mode:'demo'|'live',identity:CRMIdentity,command:Command,scope:WorkspaceScope):Promise<CRMResponse>;
function writeWorkspace(mode:'live',identity:CRMIdentity,command:Command,scope:'delivery'):Promise<{revision:number}>;
function writeWorkspace(mode:'live',identity:CRMIdentity,command:Command,scope:'finance'):Promise<FinanceDashboard>;
async function writeWorkspace(mode:'demo'|'live',identity:CRMIdentity,command:Command,scope:WorkspaceScope|'delivery'|'finance') {
  assertWorkspaceEnabled(mode);
  return withTransaction(async client=>{
    const access=await getAccess(identity,client);
    if (scope==='delivery') {
      if(access.role!=='delivery') throw new CRMError('Chức năng chỉ dành cho tài khoản Triển khai.',403);
    } else if (scope==='finance') {
      if(access.role!=='finance' || !command || !isCollectionAction(command.action)) throw new CRMError('Bạn không có quyền sử dụng thao tác Tài chính.',403);
    } else assertScope(mode,access,scope);
    if (!command || !Number.isInteger(command.expectedRevision) || command.expectedRevision<0) throw new CRMError('Thiếu phiên bản dữ liệu. Hãy tải lại trang.',400);
    const current=await rawWorkspace(mode,access,client,true);
    if (scope==='delivery') {
      await assertDeliveryCommand(client,current.row.id,current.data,command,access);
      if (command.action==='create') command={...command,data:{...command.data,owner:access.memberId}};
    } else {
      authorizeCommand(current.data,command,access);
      if (scope==='finance' && !current.data.projects.some(project=>project.id===command.id && project.contract)) throw new CRMError('Hợp đồng không có trong sổ Tài chính.',404);
    }
    const requestId = scope!=='delivery'&&(replayableActions.has(command.action) || isCollectionAction(command.action) || isSalesAction(command.action) || isSalesHandoffAction(command.action)) ? command.requestId : undefined;
    let payloadHash: string | undefined;
    if (scope!=='delivery' && requestId !== undefined) {
      if (typeof requestId !== 'string' || !requestIdPattern.test(requestId)) throw new CRMError('Mã yêu cầu lưu không hợp lệ.');
      payloadHash = createHash('sha256').update(JSON.stringify([command.action, command.id, command.collection, command.data])).digest('hex');
      const previous = (await client.query<{payload_hash:string;created_customer_ids:string[]}>('SELECT payload_hash, created_customer_ids FROM crm_mutation_requests WHERE workspace_id=$1 AND actor_id=$2 AND request_id=$3', [current.row.id, access.userId, requestId])).rows[0];
      if (previous) {
        if (previous.payload_hash !== payloadHash) throw new CRMError('Mã yêu cầu này đã dùng cho một thao tác khác.', 400);
        if (scope==='finance') return projectFinanceDashboard(current.data,current.row.revision,access);
        const result = await response(current.data, current.row.revision, mode, access, client,scope);
        if (command.action === 'import_prospects' || command.action === 'import_customers') {
          const visible = new Set((scope==='customers'?current.data:result.data).customers.map(customer => customer.id));
          result.createdCustomerIds = previous.created_customer_ids.filter(id => visible.has(id));
        }
        return result;
      }
    }
    if (mode==='live'&&scope!=='delivery') await validateProjectAssignment(current.data,current.row.id,command,client);
    if (current.row.revision !== command.expectedRevision) {
      const canUseNewWorkspace = command.action==='update' && command.collection && typeof command.id==='string' &&
        command.expectedRevision < current.row.revision &&
        await recordUnchangedSince(client,current.row.id,command.collection,command.id,command.expectedRevision);
      if (!canUseNewWorkspace) throw new CRMError('Dữ liệu đã thay đổi ở phiên khác. Hãy tải lại trước khi lưu.',409);
    }
    if (mode === 'live' && command.action === 'request_sales_handoff') {
      const eligible = await salesAssignees(current.data,client);
      if (!eligible.some(candidate=>candidate.id === command.data?.recipientId)) throw new CRMError('Chọn Sale/Account đang hoạt động và đã kích hoạt tài khoản.');
    }
    const assigningTelesales=command.action==='distribute_customers' || command.action==='transfer_to_telesales';
    if (assigningTelesales && mode==='live') {
      const data=command.data || {};
      const rawOwners=command.action==='transfer_to_telesales' ? [data.owner] : Array.isArray(data.assignments) ? data.assignments.map(value=>value && typeof value==='object' && !Array.isArray(value) ? (value as Record<string,unknown>).owner : undefined) : [];
      const recipientIds=[...new Set(rawOwners.map(value=>current.data.team.find(member=>member.id===value || member.name===value)?.id))];
      const eligible=await recipientAccounts(current.data,client);
      for (const id of recipientIds) {
        if (!eligible.some(candidate=>candidate.team_member_id===id)) throw new CRMError('Nhân viên nhận khách phải có tài khoản telesales đang hoạt động. Hãy kiểm tra tại Cài đặt tài khoản.',400);
      }
    }
    const linkedTeamDelete=mode==='live' && command.action==='delete' && command.collection==='team';
    if (linkedTeamDelete) {
      const linked=(await client.query('SELECT id FROM crm_access_accounts WHERE team_member_id=$1 LIMIT 1',[command.id])).rows[0];
      if (linked) throw new CRMError('Nhân sự đang liên kết tài khoản truy cập và không thể xóa.',400);
    }
    // Apply commands to full state, then project the response for the viewer.
    const data=applyCommand(current.data,command,identity.displayName,undefined,access,mode==='live');
    if (mode === 'live') await validateNewWorkAssignments(current.data, data, command, client);
    const revision=await saveWorkspaceRecords(client,current.row,current.data,data);
    if (scope==='delivery') return {revision};
    const imported=command.action==='import_prospects'||command.action==='import_customers';
    const createdCustomerIds=imported ? data.customers.slice(current.data.customers.length).map(customer=>customer.id) : undefined;
    if (requestId) await client.query('INSERT INTO crm_mutation_requests (workspace_id, actor_id, request_id, payload_hash, created_customer_ids) VALUES ($1,$2,$3,$4,$5)', [current.row.id, access.userId, requestId, payloadHash, createdCustomerIds || []]);
    if (scope==='finance') return projectFinanceDashboard(data,revision,access);
    const result=await response(data,revision,mode,access,client,scope);
    if(command.action==='create_prospect')result.createdCustomerId=data.customers[data.customers.length-1].id;
    if(createdCustomerIds)result.createdCustomerIds=createdCustomerIds;
    return result;
  });
}
