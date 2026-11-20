import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from './database';
import type { AccessAccount, AccessCommand, AccessContext, AccessResponse, CRMIdentity, Workspace } from './crm-types';
import { applyCommand, CRMError } from './crm-engine';
import type { AdminDashboard, AdminEvent } from './admin-types';
import { getWorkspaceRow, readWorkspaceRecords, saveWorkspaceRecords, type WorkspaceRow } from './workspace-tables';
import { mfaAvailable, mfaRequired } from './auth/mfa-crypto';
export type { AccessContext, CRMIdentity } from './crm-types';

type Control = {id:string;owner_id:string;owner_email:string;owner_name:string;revision:number;mutation_id:string;updated_at:string};
export type AccountRow = {id:string;email:string;team_member_id:string;role:AccessAccount['role'];active:number;bound_user_id:string|null;version:number;created_at:string;updated_at:string};
const roles = new Set(['manager','account','telesales','delivery','finance']);
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
async function ownerControl(identity:CRMIdentity, client:PoolClient, readOnly:boolean):Promise<Control> {
  const select = "SELECT * FROM crm_access_control WHERE id='company'" + (readOnly ? ' FOR SHARE' : ' FOR UPDATE');
  let row = (await client.query<Control>(select)).rows[0];
  if (row) return row;
  const existing = (await client.query<{owner_id:string;owner_email:string}>("SELECT owner_id,owner_email FROM crm_workspaces ORDER BY CASE WHEN id='smee:live' THEN 0 ELSE 1 END, id LIMIT 1")).rows[0];
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
  row=(await client.query<Control>(select)).rows[0];
  check(row,'Không thể xác định chủ sở hữu.',503);
  return row;
}

async function accessInTransaction(identity:CRMIdentity,client:PoolClient,readOnly=false):Promise<AccessContext> {
  check(identity?.userId && identity.email,'Vui lòng đăng nhập.',401);
  const control=await ownerControl(identity,client,readOnly);
  const base={userId:identity.userId,name:identity.displayName,email:identity.email,ownerId:control.owner_id,ownerEmail:control.owner_email,ownerName:control.owner_name,controlRevision:control.revision};
  if (identity.userId===control.owner_id) return {...base,role:'owner'};
  let account=(await client.query<AccountRow>('SELECT * FROM crm_access_accounts WHERE bound_user_id=$1'+(readOnly?'':' FOR UPDATE'),[identity.userId])).rows[0];
  if (!account && !readOnly) account=(await client.query<AccountRow>('SELECT * FROM crm_access_accounts WHERE email=$1 FOR UPDATE',[cleanEmail(identity.email)])).rows[0];
  check(account && account.active===1 && roles.has(account.role),'Tài khoản chưa được cấp quyền hoặc đã bị vô hiệu hóa.',403);
  if (!account.bound_user_id) {
    const linkedAt=new Date().toISOString();
    account=(await client.query<AccountRow>('UPDATE crm_access_accounts SET bound_user_id=$1,version=version+1,updated_at=$2 WHERE id=$3 AND bound_user_id IS NULL AND email=$4 AND active=1 RETURNING *',[identity.userId,linkedAt,account.id,cleanEmail(identity.email)])).rows[0];
    check(account,'Không thể liên kết danh tính này với tài khoản nhân viên.',403);
    await client.query("UPDATE crm_access_control SET revision=revision+1,mutation_id=$1,updated_at=$2 WHERE id='company'",[randomUUID(),linkedAt]);
    base.controlRevision++;
    await client.query('INSERT INTO crm_access_audit (id,actor_id,actor_email,action,target_id,details,at) VALUES ($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),identity.userId,identity.email,'bind_account',account.id,JSON.stringify({email:account.email}),linkedAt]);
  }
  check(account.active===1 && account.bound_user_id===identity.userId && roles.has(account.role),'Không thể liên kết danh tính này với tài khoản nhân viên.',403);
  const live=(await client.query<{linked:boolean}>(`
    SELECT EXISTS (SELECT 1 FROM crm_team member WHERE member.workspace_id=w.id AND member.id=$2) AS linked
    FROM crm_workspaces w WHERE w.id='smee:live' AND w.owner_id=$1
  `,[control.owner_id,account.team_member_id])).rows[0];
  check(live,'Không gian làm việc chưa sẵn sàng.',403);
  check(live.linked,'Nhân sự liên kết không còn trong công ty.',403);
  return {...base,role:account.role,memberId:account.team_member_id,accountId:account.id,accountVersion:account.version};
}

export async function getAccess(identity:CRMIdentity,client?:PoolClient):Promise<AccessContext> {
  return client ? accessInTransaction(identity,client) : withTransaction(db=>accessInTransaction(identity,db));
}
// Requests with a session already have a bound identity. Readers can proceed
// together, while the company lock still orders them against revocation/writes.
export async function getReadAccess(identity:CRMIdentity,client?:PoolClient):Promise<AccessContext> {
  return client ? accessInTransaction(identity,client,true) : withTransaction(db=>accessInTransaction(identity,db,true));
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
  return withTransaction(async client=>responseInTransaction(await getReadAccess(identity,client),client));
}

export async function getAdminDashboard(identity: CRMIdentity): Promise<AdminDashboard> {
  return withTransaction(async client => {
    const owner = await getReadAccess(identity, client);
    check(owner.role==='owner','Chức năng này chỉ dành cho chủ sở hữu.',403);
    const access = await responseInTransaction(owner, client);
    const row = await getWorkspaceRow(client,'live',owner,false);
    const directory = (await client.query<{settings:Workspace['settings'];team:Workspace['team']}>(`
      SELECT payload->'settings' AS settings,
        COALESCE((SELECT jsonb_agg(member.payload ORDER BY member.position) FROM crm_team member WHERE member.workspace_id=$1),'[]') AS team
      FROM crm_company_settings WHERE workspace_id=$1`, [row.id])).rows[0];
    check(directory,'Danh bạ chưa được chuyển sang các bảng nghiệp vụ.',503);
    const {settings,team}=directory;
    // Never send raw event details, credentials, or setup links to the browser.
    const result = await client.query<Omit<AdminEvent, 'at'|'reason'> & {at:Date;reason:string|null}>(`
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
        COALESCE(a.detail->'after'->>'email', a.detail->>'email', account.email, '') AS subject,
        CASE WHEN a.action IN ('account_disabled','offboarding') THEN a.detail->>'reason' END AS reason
      FROM recent_access a LEFT JOIN crm_access_accounts account ON account.id = a.target_id
      UNION ALL
      SELECT 'auth-' || e.id::text, e.created_at, e.event, COALESCE(actor.email, ''),
        COALESCE(target_user.email, target_account.email, ''), NULL::text
      FROM recent_auth e LEFT JOIN auth_users actor ON actor.id = e.actor_id
        LEFT JOIN auth_users target_user ON target_user.id = e.user_id
        LEFT JOIN crm_access_accounts target_account ON target_account.id = e.user_id
      ORDER BY at DESC, id DESC LIMIT 40
    `);
    const mfa = await client.query<{ account_id:string|null;owner:boolean;enabled:boolean;pending:boolean }>(`
      SELECT a.id AS account_id,u.id=$1 AS owner,f.user_id IS NOT NULL AS enabled,u.mfa_pending_enrollment AS pending
      FROM auth_users u LEFT JOIN crm_access_accounts a ON a.bound_user_id=u.id
      LEFT JOIN auth_mfa_factors f ON f.user_id=u.id WHERE u.id=$1 OR a.id IS NOT NULL`, [owner.userId]);
    return {
      companyName: settings.companyName,
      access,
      team,
      events: result.rows.map(({at,reason,...row})=>({...row,at:at.toISOString(),...(reason?{reason}:{})})),
      mfa:{available:mfaAvailable(),required:mfaRequired('owner'),ownerEnabled:mfa.rows.some(item=>item.owner&&item.enabled),
        enabledAccountIds:mfa.rows.flatMap(item=>item.account_id&&item.enabled?[item.account_id]:[]),
        pendingAccountIds:mfa.rows.flatMap(item=>item.account_id&&item.pending?[item.account_id]:[])},
    };
  });
}

export async function mutateAccess(identity:CRMIdentity,command:AccessCommand,{requireOffboarding=false}={}):Promise<AccessResponse> {
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
      if (requireOffboarding && existing?.active===1 && command.active===false) {
        throw new CRMError('Dùng thao tác Khóa để xác nhận mật khẩu và rà soát việc tồn.',400);
      }
      if (command.action==='set_status') check(existing && typeof command.active==='boolean','Chọn tài khoản và trạng thái hợp lệ.');
      const statusOnly=command.action==='set_status';
      const email=cleanEmail(statusOnly ? existing?.email : (command.email??existing?.email));
      let teamId=statusOnly ? existing?.team_member_id : (command.teamMemberId??existing?.team_member_id);
      const role=statusOnly ? existing?.role : (command.role??existing?.role);
      check(email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Email nhân viên không hợp lệ.');
      check(email!==cleanEmail(access.ownerEmail),'Quyền chủ sở hữu được giữ cố định, không tạo thành tài khoản nhân viên.');
      check(role && roles.has(role),'Vai trò không hợp lệ.');
      if (command.active!==undefined) check(typeof command.active==='boolean','Trạng thái tài khoản không hợp lệ.');
      if (existing?.bound_user_id) check(email===existing.email,'Email đã liên kết danh tính không thể thay đổi.');
      const workspace=await getWorkspaceRow(client,'live',access,true);
      if (command.newMember !== undefined) {
        check(!statusOnly && !existing && teamId===undefined,'Chỉ tạo nhân sự mới khi thêm tài khoản.');
        const {newMember} = command;
        check(newMember && typeof newMember.name==='string' && newMember.name.trim().length>0 && newMember.name.length<=100,'Tên nhân sự cần từ 1 đến 100 ký tự.');
        check(typeof newMember.jobTitle==='string' && newMember.jobTitle.trim().length>0 && newMember.jobTitle.length<=100,'Chức danh cần từ 1 đến 100 ký tự.');
        const data=await readWorkspaceRecords(client,workspace.id);
        check(!data.team.some(member=>cleanEmail(member.email)===email),'Email đã có trong danh bạ. Hãy chọn nhân sự có sẵn.');
        const withMember = applyCommand(data, {action:'create',collection:'team',expectedRevision:workspace.revision,
          data:{name:newMember.name.trim(),role:newMember.jobTitle.trim(),email}}, identity.displayName);
        teamId = withMember.team.at(-1)!.id;
        await saveWorkspaceRecords(client,workspace,data,withMember);
      }
      check(typeof teamId==='string' && teamId.length>0,'Chọn nhân sự trong không gian Làm việc thật.');
      check(teamId !== 'member-admin' || existing?.team_member_id === teamId,'Hồ sơ chủ sở hữu không dùng để cấp tài khoản nhân viên.');
      const teamMember=await client.query('SELECT id FROM crm_team WHERE workspace_id=$1 AND id=$2',[workspace.id,teamId]);
      check(teamMember.rowCount,'Nhân sự phải có trong không gian Làm việc thật.');
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
