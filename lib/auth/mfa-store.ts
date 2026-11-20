import type { PoolClient } from 'pg';
import { getAccess, requireOwner } from '../access-store';
import type { CRMIdentity } from '../crm-types';
import { withTransaction } from '../database';
import { isToken, newToken, tokenHash } from './crypto';
import { lockPasswordProof, verifyCurrentPassword } from './credential-proof';
import { AuthError, MfaCodeError } from './error';
import { formatMfaSecret, matchedTotpStep, mfaAvailable, mfaRequired, newMfaSecret, newRecoveryCode, protectMfaSecret, readMfaSecret, recoveryMaterial } from './mfa-crypto';

export interface MfaFactor { encrypted_secret:string; last_step:string|number }

export async function consumeMfaCode(db:PoolClient,userId:string,factor:MfaFactor,code:unknown) {
  const recovery=recoveryMaterial(code);
  if (recovery) {
    const consumed=await db.query('DELETE FROM auth_mfa_recovery_codes WHERE user_id=$1 AND code_hash=$2',[userId,tokenHash(recovery)]);
    if (!consumed.rowCount) throw new MfaCodeError();
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('mfa_recovery_used',$1,$1)",[userId]);
    return;
  }
  if (typeof code!=='string' || !/^\d{6}$/.test(code.trim())) throw new MfaCodeError();
  const step=matchedTotpStep(readMfaSecret(factor.encrypted_secret,userId),code,Number(factor.last_step));
  if (step===undefined) throw new MfaCodeError();
  const updated=await db.query('UPDATE auth_mfa_factors SET last_step=$2 WHERE user_id=$1 AND last_step<$2',[userId,step]);
  if (!updated.rowCount) throw new MfaCodeError();
}

async function lockEnrollmentSession(db:PoolClient,userId:string,token:unknown,required:boolean) {
  if (!isToken(token)) throw new AuthError('Vui lòng đăng nhập lại.',401);
  const hash=tokenHash(token);
  const {rows:[session]}=await db.query<{setup:boolean;verified:boolean;enabled:boolean;pending:boolean}>(`SELECT
    s.mfa_setup_only AS setup,s.mfa_verified AS verified,u.mfa_pending_enrollment AS pending,
    EXISTS(SELECT 1 FROM auth_mfa_factors WHERE user_id=u.id) AS enabled
    FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id AND u.credential_version=s.credential_version
    WHERE s.token_hash=$1 AND s.user_id=$2 AND s.expires_at>now() FOR UPDATE OF s`,[hash,userId]);
  if (!session || (session.setup && session.enabled) || (!session.setup && !session.verified && (session.enabled || session.pending || required))) {
    throw new AuthError('Phiên thiết lập không còn hợp lệ. Hãy đăng nhập lại.',401);
  }
  return hash;
}

export async function beginMfaEnrollment(user:CRMIdentity,session:unknown,password:unknown) {
  if (!mfaAvailable()) throw new AuthError('Máy chủ chưa cấu hình khóa MFA.',503);
  const proof=await verifyCurrentPassword(user.userId,password);
  return withTransaction(async db=>{
    const access=await getAccess(user,db);
    await lockPasswordProof(db,proof);
    const sessionHash=await lockEnrollmentSession(db,user.userId,session,mfaRequired(access.role));
    const secret=newMfaSecret();
    await db.query(`INSERT INTO auth_mfa_enrollments(user_id,session_hash,encrypted_secret,expires_at)
      VALUES ($1,$2,$3,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET
      session_hash=excluded.session_hash,encrypted_secret=excluded.encrypted_secret,expires_at=excluded.expires_at`,
      [user.userId,sessionHash,protectMfaSecret(secret,user.userId)]);
    return {secret:formatMfaSecret(secret)};
  });
}

export async function finishMfaEnrollment(user:CRMIdentity,session:unknown,code:unknown) {
  return withTransaction(async db=>{
    const access=await getAccess(user,db);
    const {rows:[auth]}=await db.query<{credential_version:number}>('SELECT credential_version FROM auth_users WHERE id=$1 FOR UPDATE',[user.userId]);
    if (!auth) throw new AuthError('Vui lòng đăng nhập lại.',401);
    const sessionHash=await lockEnrollmentSession(db,user.userId,session,mfaRequired(access.role));
    const {rows:[pending]}=await db.query<{encrypted_secret:string}>(`SELECT encrypted_secret FROM auth_mfa_enrollments
      WHERE user_id=$1 AND session_hash=$2 AND expires_at>now() FOR UPDATE`,[user.userId,sessionHash]);
    if (!pending) throw new AuthError('Mã thiết lập đã hết hạn. Hãy bắt đầu lại.');
    const step=matchedTotpStep(readMfaSecret(pending.encrypted_secret,user.userId),code,-1);
    if (step===undefined) throw new MfaCodeError();
    const codes=Array.from({length:8},()=>newRecoveryCode());
    await db.query(`INSERT INTO auth_mfa_factors(user_id,encrypted_secret,last_step) VALUES($1,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,last_step=excluded.last_step,enrolled_at=now()`,
      [user.userId,pending.encrypted_secret,step]);
    await db.query('DELETE FROM auth_mfa_recovery_codes WHERE user_id=$1',[user.userId]);
    await db.query('INSERT INTO auth_mfa_recovery_codes(user_id,code_hash) SELECT $1,unnest($2::text[])',
      [user.userId,codes.map(item=>tokenHash(recoveryMaterial(item)!))]);
    const credentialVersion=auth.credential_version+1;
    await db.query('UPDATE auth_users SET credential_version=$2,mfa_pending_enrollment=false,updated_at=now() WHERE id=$1',[user.userId,credentialVersion]);
    await db.query('DELETE FROM auth_sessions WHERE user_id=$1',[user.userId]);
    await db.query('DELETE FROM auth_setup_tokens WHERE email=$1',[user.email]);
    const token=newToken();
    await db.query(`INSERT INTO auth_sessions(token_hash,user_id,credential_version,expires_at,mfa_verified)
      VALUES($1,$2,$3,now()+interval '8 hours',true)`,[tokenHash(token),user.userId,credentialVersion]);
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('mfa_enrolled',$1,$1)",[user.userId]);
    return {token,codes};
  });
}

async function forceEnrollment(db:PoolClient,userId:string,email:string) {
  await db.query('DELETE FROM auth_mfa_factors WHERE user_id=$1',[userId]);
  await db.query('UPDATE auth_users SET mfa_pending_enrollment=true,credential_version=credential_version+1,updated_at=now() WHERE id=$1',[userId]);
  await db.query('DELETE FROM auth_sessions WHERE user_id=$1',[userId]);
  await db.query('DELETE FROM auth_setup_tokens WHERE email=$1',[email]);
}

export async function resetStaffMfa(owner:CRMIdentity,accountId:unknown,password:unknown) {
  if (!mfaAvailable()) throw new AuthError('Cần có khóa MFA của máy chủ trước khi cấp lại thiết bị.',503);
  if (typeof accountId!=='string'||!accountId||accountId.length>100) throw new AuthError('Chọn tài khoản hợp lệ.');
  const proof=await verifyCurrentPassword(owner.userId,password);
  await withTransaction(async db=>{
    await requireOwner(owner,db);
    await lockPasswordProof(db,proof);
    const {rows:[account]}=await db.query<{bound_user_id:string;email:string}>(`SELECT bound_user_id,email FROM crm_access_accounts
      WHERE id=$1 AND active=1 AND bound_user_id IS NOT NULL FOR UPDATE`,[accountId]);
    if (!account || account.bound_user_id===owner.userId) throw new AuthError('Chọn nhân sự đang hoạt động và đã kích hoạt.');
    await forceEnrollment(db,account.bound_user_id,account.email);
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('mfa_reset',$1,$2)",[account.bound_user_id,owner.userId]);
  });
}

export async function resetOwnerMfa() {
  if (!mfaAvailable()) throw new AuthError('Cần có khóa MFA của máy chủ trước khi cấp lại thiết bị.',503);
  const email=process.env.SMEE_OWNER_EMAIL?.trim().toLowerCase();
  await withTransaction(async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext('smee:owner:provision'))");
    const {rows:[control]}=await db.query<{owner_id:string}>("SELECT owner_id FROM crm_access_control WHERE id='company' FOR UPDATE");
    const {rows:[user]}=await db.query<{id:string}>('SELECT id FROM auth_users WHERE email=$1 FOR UPDATE',[email]);
    if (!user || !control || control.owner_id!==user.id) throw new AuthError('Không xác định được tài khoản chủ sở hữu đã cấu hình.');
    await forceEnrollment(db,user.id,email!);
    await db.query("INSERT INTO auth_security_events(event,user_id,actor_id) VALUES ('owner_mfa_reset_cli',$1,$1)",[user.id]);
  });
}
