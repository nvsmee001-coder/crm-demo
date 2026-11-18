import type { PoolClient } from 'pg';
import { withTransaction } from './database';
import type { AccessContext, Command, CRMIdentity, CRMResponse, Workspace } from './crm-types';
import { applyCommand, CRMError, normalizeWorkspace } from './crm-engine';
import { createWorkspace } from './crm-seed';
import { getAccess } from './access-store';
import { authorizeCommand, projectWorkspace, eligibleTelesalesAccounts, type TelesalesRecipientAccount } from './crm-access';

type StoredWorkspace={id:string;owner_id:string;owner_email:string;data:string;revision:number;updated_at:string};
const MAX_WORKSPACE_BYTES=1_800_000;
function spaceId(mode:'demo'|'live') { return `smee:${mode}`; }

async function rawWorkspace(mode:'demo'|'live',access:AccessContext,client:PoolClient):Promise<{row:StoredWorkspace;data:Workspace}> {
  if (access.role!=='owner' && mode!=='live') throw new CRMError('Tài khoản nhân viên chỉ sử dụng không gian Làm việc thật.',403);
  const id=spaceId(mode);
  let row=(await client.query<StoredWorkspace>('SELECT * FROM crm_workspaces WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if (!row) {
    if (access.role!=='owner') throw new CRMError('Không gian làm việc chưa được chủ sở hữu khởi tạo.',403);
    await client.query('INSERT INTO crm_workspaces (id,owner_id,owner_email,data,revision,updated_at) VALUES ($1,$2,$3,$4,0,$5) ON CONFLICT(id) DO NOTHING',[id,access.ownerId,access.ownerEmail,JSON.stringify(createWorkspace(mode)),new Date().toISOString()]);
    row=(await client.query<StoredWorkspace>('SELECT * FROM crm_workspaces WHERE id=$1 FOR UPDATE',[id])).rows[0];
  }
  if (!row || row.owner_id!==access.ownerId) throw new CRMError('Không thể mở không gian làm việc của công ty.',403);
  return {row,data:normalizeWorkspace(JSON.parse(row.data) as Workspace)};
}
async function recipientAccounts(data:Workspace,client:PoolClient):Promise<TelesalesRecipientAccount[]> {
  // The company row lock acquired by getAccess is held until commit. Account
  // changes also take that lock, so recipient eligibility cannot race this write.
  const result=await client.query<TelesalesRecipientAccount>("SELECT id,team_member_id,role,active,version FROM crm_access_accounts WHERE role='telesales' AND active=1 ORDER BY id");
  return eligibleTelesalesAccounts(data,result.rows);
}
async function response(data:Workspace,revision:number,mode:'demo'|'live',access:AccessContext,client:PoolClient):Promise<CRMResponse> {
  const result:CRMResponse={data:projectWorkspace(data,access),revision,mode,user:{name:access.name,email:access.email,role:access.role,memberId:access.memberId}};
  if (access.role==='owner' || access.role==='manager') {
    const eligible=mode==='demo' ? new Set(data.team.map(member=>member.id)) : new Set((await recipientAccounts(data,client)).map(account=>account.team_member_id));
    result.telesalesAssignees=data.team.filter(member=>eligible.has(member.id)).map(member=>({id:member.id,name:member.name}));
  }
  return result;
}
export async function loadWorkspace(mode:'demo'|'live',identity:CRMIdentity):Promise<CRMResponse> {
  return withTransaction(async client=>{
    const access=await getAccess(identity,client);
    const {row,data}=await rawWorkspace(mode,access,client);
    return response(data,row.revision,mode,access,client);
  });
}
export async function mutateWorkspace(mode:'demo'|'live',identity:CRMIdentity,command:Command):Promise<CRMResponse> {
  return withTransaction(async client=>{
    const access=await getAccess(identity,client);
    if (!command || !Number.isInteger(command.expectedRevision) || command.expectedRevision<0) throw new CRMError('Thiếu phiên bản dữ liệu. Hãy tải lại trang.',400);
    const current=await rawWorkspace(mode,access,client);
    authorizeCommand(current.data,command,access);
    if (current.row.revision!==command.expectedRevision) throw new CRMError('Dữ liệu đã thay đổi ở phiên khác. Hãy tải lại trước khi lưu.',409);
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
    const data=applyCommand(current.data,command,identity.displayName),json=JSON.stringify(data);
    if (Buffer.byteLength(json,'utf8')>MAX_WORKSPACE_BYTES) throw new CRMError('Không gian đã đạt giới hạn dữ liệu. Vui lòng xuất bản sao và liên hệ quản trị.',413);
    const updated=await client.query('UPDATE crm_workspaces SET data=$1,revision=revision+1,updated_at=$2 WHERE id=$3 AND revision=$4 AND owner_id=$5',[json,new Date().toISOString(),spaceId(mode),current.row.revision,access.ownerId]);
    if (updated.rowCount!==1) throw new CRMError('Một phiên khác vừa cập nhật dữ liệu. Hãy tải lại trước khi lưu.',409);
    return response(data,current.row.revision+1,mode,access,client);
  });
}
