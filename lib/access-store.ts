import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from './database';
import type { AccessAccount, AccessCommand, AccessContext, AccessResponse, CRMIdentity, Workspace } from './crm-types';
import { CRMError } from './crm-engine';
import { createWorkspace } from './crm-seed';
import type { AdminDashboard, AdminEvent } from './admin-types';
export type { AccessContext, CRMIdentity } from './crm-types';

type Control = {id:string;owner_id:string;owner_email:string;owner_name:string;revision:number;mutation_id:string;updated_at:string};
export type AccountRow = {id:string;email:string;team_member_id:string;role:AccessAccount['role'];active:number;bound_user_id:string|null;version:number;created_at:string;updated_at:string};
type Stored = {id:string;owner_id:string;owner_email:string;data:string;revision:number;updated_at:string};
const roles = new Set(['manager','account','telesales']);
const cleanEmail = (value:unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
function check(ok:unknown,message:string,status=400):asserts ok { if (!ok) throw new CRMError(message,status); }
export function accessDatabase() { return pool; }
function publicAccount(row:AccountRow):AccessAccount {
  return {id:row.id,email:row.email,teamMemberId:row.team_member_id,role:row.role,active:row.active===1,bound:!!row.bound_user_id,createdAt:row.created_at,updatedAt:row.updated_at};
}

/**
 * All access/workspace transactions lock this singleton first. Revocations,
 * staff binding, recipient changes and snapshot writes share one lock order.
 */
async function ownerControl(identity:CRMIdentity, client:PoolClient):Promise<Control> {
  let row = (await client.query<Control>("SELECT * FROM crm_access_control WHERE id='company' FOR UPDATE")).rows[0];
  if (row) return row;
  const existing = (await client.query<Stored>("SELECT * FROM crm_workspaces ORDER BY CASE WHEN id='smee:live' THEN 0 ELSE 1 END, id LIMIT 1")).rows[0];
  let ownerId:string, ownerEmail:string, ownerName:string;
  if (existing) {
    ownerId=existing.owner_id; ownerEmail=existing.owner_email;
    ownerName=identity.userId===ownerId ? identity.displayName : ownerEmail;
  } else {
    const configured=cleanEmail(process.env.SMEE_OWNER_EMAIL);
    check(configured && configured===cleanEmail(identity.email),'Chỉ chủ sở hữu đã được cấu hình mới có thể khởi tạo công ty.',403);
    ownerId=identity.userId; ownerEmail=identity.email; ownerName=identity.displayName;
  }
  await client.query("INSERT INTO crm_access_control (id,owner_id,owner_email,owner_name,revision,mutation_id,updated_at) VALUES ('company',$1,$2,$3,0,'',$4) ON CONFLICT(id) DO NOTHING",[ownerId,ownerEmail,ownerName,new Date().toISOString()]);
  row=(await client.query<Control>("SELECT * FROM crm_access_control WHERE id='company' FOR UPDATE")).rows[0];
  check(row,'Không thể xác định chủ sở hữu.',503);
  return row;
}

async function accessInTransaction(identity:CRMIdentity,client:PoolClient):Promise<AccessContext> {
  check(identity?.userId && identity.email,'Vui lòng đăng nhập.',401);
  const control=await ownerControl(identity,client);
  const base={userId:identity.userId,name:identity.displayName,email:identity.email,ownerId:control.owner_id,ownerEmail:control.owner_email,ownerName:control.owner_name,controlRevision:control.revision};
  if (identity.userId===control.owner_id) return {...base,role:'owner'};
  let account=(await client.query<AccountRow>('SELECT * FROM crm_access_accounts WHERE bound_user_id=$1 FOR UPDATE',[identity.userId])).rows[0];
  if (!account) account=(await client.query<AccountRow>('SELECT * FROM crm_access_accounts WHERE email=$1 FOR UPDATE',[cleanEmail(identity.email)])).rows[0];
  check(account && account.active===1 && roles.has(account.role),'Tài khoản chưa được cấp quyền hoặc đã bị vô hiệu hóa.',403);
  if (!account.bound_user_id) {
    account=(await client.query<AccountRow>('UPDATE crm_access_accounts SET bound_user_id=$1,version=version+1,updated_at=$2 WHERE id=$3 AND bound_user_id IS NULL AND email=$4 AND active=1 RETURNING *',[identity.userId,new Date().toISOString(),account.id,cleanEmail(identity.email)])).rows[0];
    check(account,'Không thể liên kết danh tính này với tài khoản nhân viên.',403);
    await client.query('INSERT INTO crm_access_audit (id,actor_id,actor_email,action,target_id,details,at) VALUES ($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),identity.userId,identity.email,'bind_account',account.id,JSON.stringify({email:account.email}),new Date().toISOString()]);
  }
  check(account.active===1 && account.bound_user_id===identity.userId && roles.has(account.role),'Không thể liên kết danh tính này với tài khoản nhân viên.',403);
  const live=(await client.query<{linked:boolean}>(`
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(w.data::jsonb->'team') member WHERE member->>'id'=$2
    ) AS linked
    FROM crm_workspaces w WHERE w.id='smee:live' AND w.owner_id=$1
  `,[control.owner_id,account.team_member_id])).rows[0];
  check(live,'Không gian làm việc chưa sẵn sàng.',403);
  check(live.linked,'Nhân sự liên kết không còn trong công ty.',403);
  return {...base,role:account.role,memberId:account.team_member_id,accountId:account.id,accountVersion:account.version};
}

export async function getAccess(identity:CRMIdentity,client?:PoolClient):Promise<AccessContext> {
  return client ? accessInTransaction(identity,client) : withTransaction(db=>accessInTransaction(identity,db));
}
export async function requireOwner(identity:CRMIdentity,client?:PoolClient):Promise<AccessContext> {
  const access=await getAccess(identity,client); check(access.role==='owner','Chức năng này chỉ dành cho chủ sở hữu.',403); return access;
}
export async function requireBusinessManager(identity:CRMIdentity,client?:PoolClient):Promise<AccessContext> {
  const access=await getAccess(identity,client); check(access.role==='owner' || access.role==='manager','Chức năng này chỉ dành cho chủ sở hữu hoặc quản lý.',403); return access;
}

async function responseInTransaction(access:AccessContext,client:PoolClient):Promise<AccessResponse> {
  const result:AccessResponse={viewer:{role:access.role,memberId:access.memberId,name:access.name,email:access.email},owner:{email:access.ownerEmail,name:access.ownerName}};
  if (access.role==='owner') {
    const control=(await client.query<{revision:number}>("SELECT revision FROM crm_access_control WHERE id='company'")).rows[0];
    const accounts=(await client.query<AccountRow>('SELECT * FROM crm_access_accounts ORDER BY created_at,email')).rows;
    result.revision=control.revision; result.accounts=accounts.map(publicAccount);
  }
  return result;
}
export async function getAccessResponse(identity:CRMIdentity):Promise<AccessResponse> {
  return withTransaction(async client=>responseInTransaction(await getAccess(identity,client),client));
}

export async function getAdminDashboard(identity: CRMIdentity): Promise<AdminDashboard> {
  return withTransaction(async client => {
    const owner = await requireOwner(identity, client);
    const access = await responseInTransaction(owner, client);
    const { data } = await liveWorkspace(owner, client);
    // Never send raw event details, credentials, or setup links to the browser.
    const result = await client.query<Omit<AdminEvent, 'at'> & { at: Date }>(`
      WITH recent_access AS (
        SELECT id, actor_email, target_id, action, details::jsonb AS detail, at
        FROM crm_access_audit ORDER BY at DESC, id DESC LIMIT 40
      ), recent_auth AS (
        SELECT id, actor_id, user_id, event, created_at
        FROM auth_security_events ORDER BY created_at DESC, id DESC LIMIT 40
      )
      SELECT 'access-' || a.id AS id, a.at::timestamptz AS at,
        CASE WHEN a.action = 'set_status' THEN
            CASE WHEN a.detail->'after'->>'active' = 'true' THEN 'account_enabled' ELSE 'account_disabled' END
          WHEN a.action = 'upsert' AND a.detail->'before' = 'null'::jsonb THEN 'account_created'
          ELSE a.action END AS action,
        a.actor_email AS actor,
        COALESCE(a.detail->'after'->>'email', a.detail->>'email', account.email, '') AS subject
      FROM recent_access a LEFT JOIN crm_access_accounts account ON account.id = a.target_id
      UNION ALL
      SELECT 'auth-' || e.id::text, e.created_at, e.event, COALESCE(actor.email, ''),
        COALESCE(target_user.email, target_account.email, '')
      FROM recent_auth e LEFT JOIN auth_users actor ON actor.id = e.actor_id
        LEFT JOIN auth_users target_user ON target_user.id = e.user_id
        LEFT JOIN crm_access_accounts target_account ON target_account.id = e.user_id
      ORDER BY at DESC, id DESC LIMIT 40
    `);
    return {
      companyName: data.settings.companyName,
      access,
      team: data.team,
      events: result.rows.map(row => ({ ...row, at: row.at.toISOString() })),
    };
  });
}

async function liveWorkspace(access:AccessContext,client:PoolClient):Promise<{data:Workspace;revision:number}> {
  let row=(await client.query<Stored>("SELECT * FROM crm_workspaces WHERE id='smee:live' FOR UPDATE")).rows[0];
  if (!row) {
    await client.query("INSERT INTO crm_workspaces (id,owner_id,owner_email,data,revision,updated_at) VALUES ('smee:live',$1,$2,$3,0,$4) ON CONFLICT(id) DO NOTHING",[access.ownerId,access.ownerEmail,JSON.stringify(createWorkspace('live')),new Date().toISOString()]);
    row=(await client.query<Stored>("SELECT * FROM crm_workspaces WHERE id='smee:live' FOR UPDATE")).rows[0];
  }
  check(row && row.owner_id===access.ownerId,'Không thể mở không gian làm việc của công ty.',403);
  return {data:JSON.parse(row.data) as Workspace,revision:row.revision};
}

export async function mutateAccess(identity:CRMIdentity,command:AccessCommand):Promise<AccessResponse> {
  try {
    return await withTransaction(async client=>{
      const access=await requireOwner(identity,client);
      check(command && Number.isInteger(command.expectedRevision) && command.expectedRevision>=0,'Thiếu phiên bản danh sách tài khoản.');
      const control=(await client.query<Control>("SELECT * FROM crm_access_control WHERE id='company'")).rows[0];
      check(control && control.revision===command.expectedRevision,'Danh sách tài khoản đã thay đổi. Hãy tải lại.',409);
      check(command.action==='upsert' || command.action==='set_status','Thao tác tài khoản không hợp lệ.');
      if (command.id!==undefined) check(typeof command.id==='string' && command.id.length>0 && command.id.length<=100,'Mã tài khoản không hợp lệ.');
      const existing=command.id ? (await client.query<AccountRow>('SELECT * FROM crm_access_accounts WHERE id=$1 FOR UPDATE',[command.id])).rows[0] : undefined;
      if (command.id) check(existing,'Không tìm thấy tài khoản.',404);
      if (command.action==='set_status') check(existing && typeof command.active==='boolean','Chọn tài khoản và trạng thái hợp lệ.');
      const statusOnly=command.action==='set_status';
      const email=cleanEmail(statusOnly ? existing?.email : (command.email??existing?.email));
      const teamId=statusOnly ? existing?.team_member_id : (command.teamMemberId??existing?.team_member_id);
      const role=statusOnly ? existing?.role : (command.role??existing?.role);
      check(email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Email nhân viên không hợp lệ.');
      check(email!==cleanEmail(access.ownerEmail),'Quyền chủ sở hữu được giữ cố định, không tạo thành tài khoản nhân viên.');
      check(typeof teamId==='string' && teamId.length>0,'Chọn nhân sự trong không gian Làm việc thật.');
      check(role && roles.has(role),'Vai trò không hợp lệ.');
      if (command.active!==undefined) check(typeof command.active==='boolean','Trạng thái tài khoản không hợp lệ.');
      if (existing?.bound_user_id) check(email===existing.email,'Email đã liên kết danh tính không thể thay đổi.');
      const live=await liveWorkspace(access,client);
      check(live.data.team.some(member=>member.id===teamId),'Nhân sự phải có trong không gian Làm việc thật.');
      const duplicate=(await client.query<{id:string}>('SELECT id FROM crm_access_accounts WHERE (email=$1 OR team_member_id=$2) AND id<>$3 LIMIT 1',[email,teamId,existing?.id || ''])).rows[0];
      check(!duplicate,'Email hoặc nhân sự đã có tài khoản.');
      const id=existing?.id || randomUUID(),now=new Date().toISOString();
      const next={id,email,teamMemberId:teamId,role,active:command.active??(existing ? existing.active===1 : true)};
      if (existing) {
        const result=await client.query('UPDATE crm_access_accounts SET email=$1,team_member_id=$2,role=$3,active=$4,version=version+1,updated_at=$5 WHERE id=$6 AND version=$7',[email,teamId,role,next.active?1:0,now,id,existing.version]);
        check(result.rowCount===1,'Không thể cập nhật tài khoản.',409);
        // Sessions revoked here stay revoked after the account is re-enabled.
        if (!next.active || role!==existing.role || teamId!==existing.team_member_id || email!==existing.email) {
          await client.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE id=$1 OR email=$2 OR email=$3)',[existing.bound_user_id,existing.email,email]);
          await client.query('DELETE FROM auth_setup_tokens WHERE crm_account_id=$1',[existing.id]);
        }
      } else {
        await client.query('INSERT INTO crm_access_accounts (id,email,team_member_id,role,active,bound_user_id,version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,NULL,0,$6,$6)',[id,email,teamId,role,next.active?1:0,now]);
      }
      const updated=await client.query("UPDATE crm_access_control SET revision=revision+1,mutation_id=$1,updated_at=$2 WHERE id='company' AND revision=$3 AND owner_id=$4",[randomUUID(),now,command.expectedRevision,access.ownerId]);
      check(updated.rowCount===1,'Danh sách tài khoản đã thay đổi. Hãy tải lại.',409);
      await client.query('INSERT INTO crm_access_audit (id,actor_id,actor_email,action,target_id,details,at) VALUES ($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),identity.userId,identity.email,command.action,id,JSON.stringify({before:existing?publicAccount(existing):null,after:next}),now]);
      return responseInTransaction(access,client);
    });
  } catch (error) {
    if (error instanceof CRMError) throw error;
    if (typeof error==='object' && error!==null && 'code' in error && error.code==='23505') throw new CRMError('Email hoặc nhân sự đã có tài khoản.',409);
    throw error;
  }
}
