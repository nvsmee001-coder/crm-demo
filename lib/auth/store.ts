import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../database';
import { getAccess } from '../access-store';
import { hashPassword, isToken, newToken, normalizeEmail, passwordProblem, tokenHash, validEmail, verifyPassword } from './crypto';
import { AuthError, MfaRequiredError } from './error';
import { mfaRequired } from './mfa-crypto';
import { consumeMfaCode, type MfaFactor } from './mfa-store';

export { AuthError } from './error';
export const LOGIN_ERROR = 'Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được cấp quyền.';
const DUMMY_HASH = `scrypt$65536$8$2$${'0'.repeat(64)}$${'0'.repeat(128)}`;
type AuthUser = {id:string;email:string;display_name:string;password_hash:string;credential_version:number;mfa_pending_enrollment:boolean};
const identity = (user: AuthUser) => ({userId:user.id,email:user.email,displayName:user.display_name});
export async function loginPassword(emailInput: unknown, password: unknown, code?: unknown) {
  const email=normalizeEmail(emailInput);
  if(!validEmail(email) || typeof password!=='string' || password.length>128)throw new AuthError(LOGIN_ERROR,401);
  const initial=(await query<AuthUser>('SELECT * FROM auth_users WHERE email=$1',[email])).rows[0];
  const verified=await verifyPassword(password,initial?.password_hash || DUMMY_HASH);
  if(!initial || !verified)throw new AuthError(LOGIN_ERROR,401);
  const token=newToken();
  const setupRequired=await withTransaction(async db=>{
    let access;
    try{access=await getAccess(identity(initial),db);}catch(error){if(error && typeof error==='object' && 'status' in error && (error.status===401||error.status===403))throw new AuthError(LOGIN_ERROR,401);throw error;}
    const current=(await db.query<AuthUser>('SELECT * FROM auth_users WHERE id=$1 FOR UPDATE',[initial.id])).rows[0];
    if(!current || current.password_hash!==initial.password_hash || current.credential_version!==initial.credential_version)throw new AuthError(LOGIN_ERROR,401);
    const { rows:[factor] }=await db.query<MfaFactor>('SELECT encrypted_secret,last_step FROM auth_mfa_factors WHERE user_id=$1',[current.id]);
    if (factor) {
      if (code===undefined || code===null || code==='') throw new MfaRequiredError();
      await consumeMfaCode(db,current.id,factor,code);
    }
    const setup=!factor && (current.mfa_pending_enrollment || mfaRequired(access.role));
    await db.query('DELETE FROM auth_sessions WHERE expires_at <= now()');
    await db.query("DELETE FROM auth_security_events WHERE id IN (SELECT id FROM auth_security_events WHERE created_at < now()-interval '90 days' ORDER BY id LIMIT 1000)");
    // Keep at most ten live sessions for an account; creating a session cannot grow without bound.
    await db.query('DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE user_id=$1 ORDER BY created_at DESC OFFSET 9)',[current.id]);
    await db.query(`INSERT INTO auth_sessions (token_hash,user_id,credential_version,expires_at,mfa_setup_only,mfa_verified)
      VALUES ($1,$2,$3,now()+CASE WHEN $4 THEN interval '10 minutes' ELSE interval '8 hours' END,$4,$5)`,
      [tokenHash(token),current.id,current.credential_version,setup,!!factor]);
    if (!setup) await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('login',$1,$1)",[current.id]);
    return setup;
  });
  return{token,setupRequired};
}
export async function logoutToken(token: unknown):Promise<void>{if(isToken(token))await query('DELETE FROM auth_sessions WHERE token_hash=$1',[tokenHash(token)]);}
export async function issueSetupToken(accountId: unknown, actorId: string):Promise<string>{
  if(typeof accountId!=='string' || accountId.length>100)throw new AuthError('Chọn tài khoản nhân viên hợp lệ.');
  const token=newToken();
  await withTransaction(async db=>{
    const control=(await db.query<{owner_id:string}>("SELECT owner_id FROM crm_access_control WHERE id='company' FOR UPDATE")).rows[0];
    if(!control || control.owner_id!==actorId)throw new AuthError('Chỉ chủ sở hữu được tạo liên kết đặt mật khẩu.',403);
    const account=(await db.query<{id:string;email:string;active:number}>('SELECT id,email,active FROM crm_access_accounts WHERE id=$1 FOR UPDATE',[accountId])).rows[0];
    if(!account || account.active!==1)throw new AuthError('Chỉ tạo liên kết cho tài khoản nhân viên đang hoạt động.',400);
    await db.query('DELETE FROM auth_setup_tokens WHERE crm_account_id=$1 OR expires_at<=now()',[account.id]);
    await db.query("INSERT INTO auth_setup_tokens(token_hash,email,crm_account_id,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')",[tokenHash(token),account.email,account.id]);
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('setup_link_created',$1,$2)",[account.id,actorId]);
  });
  return token;
}
export async function activatePassword(tokenInput: unknown,passwordInput: unknown):Promise<void>{
  if(!isToken(tokenInput))throw new AuthError('Liên kết không hợp lệ hoặc đã hết hạn.',400);
  const problem=passwordProblem(passwordInput);if(problem)throw new AuthError(problem);
  const newHash=await hashPassword(passwordInput as string);
  await withTransaction(async db=>{
    await db.query("SELECT id FROM crm_access_control WHERE id='company' FOR UPDATE");
    const token=(await db.query<{email:string;crm_account_id:string}>('SELECT email,crm_account_id FROM auth_setup_tokens WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',[tokenHash(tokenInput)])).rows[0];
    if(!token)throw new AuthError('Liên kết không hợp lệ hoặc đã hết hạn.',400);
    const account=(await db.query<{id:string;email:string;active:number;bound_user_id:string|null;team_member_id:string}>('SELECT id,email,active,bound_user_id,team_member_id FROM crm_access_accounts WHERE id=$1 FOR UPDATE',[token.crm_account_id])).rows[0];
    if(!account || account.active!==1 || account.email!==token.email)throw new AuthError('Liên kết không hợp lệ hoặc tài khoản đã bị khóa.',400);
    let user=(await db.query<AuthUser>('SELECT * FROM auth_users WHERE email=$1 FOR UPDATE',[token.email])).rows[0];
    if(account.bound_user_id && (!user || account.bound_user_id!==user.id))throw new AuthError('Liên kết tài khoản cần được quản trị viên kiểm tra.',409);
    if(user){
      await db.query('UPDATE auth_users SET password_hash=$1,credential_version=credential_version+1,updated_at=now() WHERE id=$2',[newHash,user.id]);
    }else{
      const id=randomUUID();
      const member=(await db.query<{name: string}>("SELECT payload->>'name' AS name FROM crm_team WHERE workspace_id='smee:live' AND id=$1", [account.team_member_id])).rows[0];
      if(!member)throw new AuthError('Nhân sự không còn trong danh bạ. Liên hệ chủ sở hữu.',409);
      const created=await db.query<AuthUser>('INSERT INTO auth_users(id,email,display_name,password_hash) VALUES ($1,$2,$3,$4) RETURNING *',[id,token.email,member.name,newHash]);user=created.rows[0];
    }
    const linkedAt=new Date().toISOString();
    await db.query('UPDATE crm_access_accounts SET bound_user_id=$1,version=version+1,updated_at=$3 WHERE id=$2',[user.id,account.id,linkedAt]);
    if (!account.bound_user_id) await db.query("UPDATE crm_access_control SET revision=revision+1,mutation_id=$1,updated_at=$2 WHERE id='company'",[randomUUID(),linkedAt]);
    await db.query('DELETE FROM auth_sessions WHERE user_id=$1',[user.id]);
    await db.query('DELETE FROM auth_setup_tokens WHERE crm_account_id=$1',[account.id]);
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('password_activated',$1,$1)",[user.id]);
  });
}
export async function changePassword(userId: string,currentPassword: unknown,newPassword: unknown):Promise<void>{
  const problem=passwordProblem(newPassword);if(problem)throw new AuthError(problem);
  if(typeof currentPassword!=='string' || currentPassword.length>128)throw new AuthError('Mật khẩu hiện tại không đúng.',400);
  const initial=(await query<AuthUser>('SELECT * FROM auth_users WHERE id=$1',[userId])).rows[0];
  if(!initial || !await verifyPassword(currentPassword,initial.password_hash))throw new AuthError('Mật khẩu hiện tại không đúng.',400);
  const next=await hashPassword(newPassword as string);
  await withTransaction(async db=>{
    try{await getAccess(identity(initial),db);}catch{throw new AuthError('Tài khoản đã thay đổi hoặc bị khóa. Hãy đăng nhập lại.',401);}
    const updated=await db.query('UPDATE auth_users SET password_hash=$1,credential_version=credential_version+1,updated_at=now() WHERE id=$2 AND credential_version=$3',[next,userId,initial.credential_version]);
    if(updated.rowCount!==1)throw new AuthError('Tài khoản vừa thay đổi. Hãy đăng nhập lại.',409);
    await db.query('DELETE FROM auth_sessions WHERE user_id=$1',[userId]);
    await db.query('DELETE FROM auth_setup_tokens WHERE email=$1',[initial.email]);
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('password_changed',$1,$1)",[userId]);
  });
}
export async function provisionOwner(emailInput:unknown,password:unknown,displayNameInput:unknown):Promise<void>{
  const email=normalizeEmail(emailInput),configured=normalizeEmail(process.env.SMEE_OWNER_EMAIL);
  if(!configured || configured!==email || !validEmail(email))throw new AuthError('Email chủ sở hữu phải trùng SMEE_OWNER_EMAIL trong cấu hình.');
  const problem=passwordProblem(password);if(problem)throw new AuthError(problem);
  const displayName=typeof displayNameInput==='string'?displayNameInput.trim().slice(0,100):'';
  if(!displayName)throw new AuthError('Nhập tên chủ sở hữu.');
  const hash=await hashPassword(password as string);
  await withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext('smee:owner:provision'))");
    const control=(await db.query<{owner_email:string;owner_id:string}>('SELECT owner_email,owner_id FROM crm_access_control WHERE id=$1',['company'])).rows[0];
    if(control)throw new AuthError('Công ty đã có chủ sở hữu. Dùng lệnh đặt lại mật khẩu chủ sở hữu khi cần, không tạo lại.',409);
    if((await db.query('SELECT id FROM auth_users WHERE email=$1',[email])).rowCount)throw new AuthError('Tài khoản chủ sở hữu đã tồn tại. Dùng lệnh đặt lại mật khẩu nếu cần.',409);
    const id=randomUUID();
    await db.query('INSERT INTO auth_users(id,email,display_name,password_hash) VALUES ($1,$2,$3,$4)',[id,email,displayName,hash]);
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('owner_provisioned',$1,$1)",[id]);
  });
}
export async function resetOwnerPassword(password:unknown):Promise<void>{
  const email=normalizeEmail(process.env.SMEE_OWNER_EMAIL);if(!validEmail(email))throw new AuthError('Cấu hình SMEE_OWNER_EMAIL trước khi đặt lại mật khẩu.');
  const problem=passwordProblem(password);if(problem)throw new AuthError(problem);
  const hash=await hashPassword(password as string);
  await withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext('smee:owner:provision'))");
    const control=(await db.query<{owner_id:string}>("SELECT owner_id FROM crm_access_control WHERE id='company' FOR UPDATE")).rows[0];
    const user=(await db.query<AuthUser>('SELECT * FROM auth_users WHERE email=$1 FOR UPDATE',[email])).rows[0];
    if(!user)throw new AuthError('Chưa có tài khoản chủ sở hữu. Chạy lệnh tạo chủ sở hữu trước.');
    if(control && control.owner_id!==user.id)throw new AuthError('Định danh chủ sở hữu không khớp; cần rà soát dữ liệu chuyển đổi.');
    await db.query('UPDATE auth_users SET password_hash=$1,credential_version=credential_version+1,updated_at=now() WHERE id=$2',[hash,user.id]);
    await db.query('DELETE FROM auth_sessions WHERE user_id=$1',[user.id]);
    await db.query('DELETE FROM auth_setup_tokens WHERE email=$1',[email]);
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('owner_password_reset_cli',$1,$1)",[user.id]);
  });
}
