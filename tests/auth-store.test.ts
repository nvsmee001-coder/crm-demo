import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const enabled=process.env.TEST_AUTH_DATABASE_RESET==='1' && !!process.env.TEST_AUTH_DATABASE_URL;
if(enabled)process.env.DATABASE_URL=process.env.TEST_AUTH_DATABASE_URL;
test('independent auth: credentials, one-use activation, session revocation and account locks',{skip:!enabled},async t=>{
 const {query,pool}=await import('../lib/database');
 const auth=await import('../lib/auth/store');
 const {tokenHash}=await import('../lib/auth/crypto');
 const {loadWorkspace,mutateWorkspace}=await import('../lib/crm-store');
 const {getAccessResponse,mutateAccess}=await import('../lib/access-store');
 const email='auth-owner@example.test',password='fixture owner password '+randomUUID(),staffPassword='fixture staff password '+randomUUID(),nextStaffPassword='fixture new password '+randomUUID();
 process.env.SMEE_OWNER_EMAIL=email;
 try{
  const exists=(await query<{present:string|null}>("SELECT to_regclass('public.auth_users')::text AS present")).rows[0].present;
  if(!exists)for(const file of(await readdir(resolve('migrations'))).filter(name=>name.endsWith('.sql')).sort())await query(await readFile(resolve('migrations',file),'utf8'));
  await query('TRUNCATE crm_access_accounts,crm_access_control,crm_access_audit,crm_workspaces,auth_users,auth_security_events CASCADE');
  let owner:{userId:string;email:string;displayName:string},accountId='',staffId='',ownerToken='',staffToken='';
  await t.test('owner is CLI-provisioned once and a login creates a hashed expiring token',async()=>{
   await auth.provisionOwner(email,password,'Auth QA Owner');
   await assert.rejects(auth.provisionOwner(email,password,'Duplicate'),(e:unknown)=>e instanceof auth.AuthError&&e.status===409);
   const logged=await auth.loginPassword(email,password);ownerToken=logged.token;
   const user=(await query<{id:string;password_hash:string}>('SELECT id,password_hash FROM auth_users WHERE email=$1',[email])).rows[0];
   assert.notEqual(user.password_hash,password);owner={userId:user.id,email,displayName:'Auth QA Owner'};
   const session=(await query<{token_hash:string;expires_at:Date}>('SELECT token_hash,expires_at FROM auth_sessions WHERE user_id=$1',[user.id])).rows[0];
   assert.equal(session.token_hash,tokenHash(ownerToken));assert.notEqual(session.token_hash,ownerToken);assert.ok(new Date(session.expires_at).getTime()>Date.now());
  });
  await t.test('wrong passwords and unknown emails use the same denial',async()=>{
   for(const[e,p]of[[email,'wrong password'],['missing@example.test',password]])await assert.rejects(auth.loginPassword(e,p),(error:unknown)=>error instanceof auth.AuthError&&error.status===401&&error.message===auth.LOGIN_ERROR);
  });
  await t.test('owner can prepare an active employee and only owner identity can issue setup links',async()=>{
   let state=await loadWorkspace('live',owner);
   state=await mutateWorkspace('live',owner,{action:'create',collection:'team',data:{name:'Auth QA Telesales',email:'auth-staff@example.test',role:'Telesales'},expectedRevision:state.revision});
   const memberId=state.data.team.find(member=>member.email==='auth-staff@example.test')!.id;
   let access=await getAccessResponse(owner);access=await mutateAccess(owner,{action:'upsert',email:'auth-staff@example.test',teamMemberId:memberId,role:'telesales',active:true,expectedRevision:access.revision!});
   accountId=access.accounts!.find(account=>account.email==='auth-staff@example.test')!.id;
   await assert.rejects(auth.issueSetupToken(accountId,randomUUID()),(error:unknown)=>error instanceof auth.AuthError&&error.status===403);
  });
  await t.test('new link replaces old link, token is single-use and password activation binds stable identity',async()=>{
   const old=await auth.issueSetupToken(accountId,owner.userId),token=await auth.issueSetupToken(accountId,owner.userId);
   assert.equal((await query('SELECT token_hash FROM auth_setup_tokens WHERE token_hash=$1',[old])).rowCount,0);
   await assert.rejects(auth.activatePassword(old,staffPassword),/hết hạn/);
   await auth.activatePassword(token,staffPassword);await assert.rejects(auth.activatePassword(token,staffPassword),/hết hạn/);
   const user=(await query<{id:string}>('SELECT id FROM auth_users WHERE email=$1',['auth-staff@example.test'])).rows[0];staffId=user.id;
   assert.equal((await query<{bound_user_id:string}>('SELECT bound_user_id FROM crm_access_accounts WHERE id=$1',[accountId])).rows[0].bound_user_id,staffId);
   staffToken=(await auth.loginPassword('auth-staff@example.test',staffPassword)).token;
  });
  await t.test('password change verifies current password and revokes every old session',async()=>{
   await assert.rejects(auth.changePassword(staffId,'wrong',nextStaffPassword),/không đúng/);
   await auth.changePassword(staffId,staffPassword,nextStaffPassword);
   assert.equal((await query('SELECT token_hash FROM auth_sessions WHERE user_id=$1',[staffId])).rowCount,0);
   await assert.rejects(auth.loginPassword('auth-staff@example.test',staffPassword),/không đúng/);
   staffToken=(await auth.loginPassword('auth-staff@example.test',nextStaffPassword)).token;
  });
  await t.test('disabled account loses sessions/setup links; enabling does not resurrect either',async()=>{
   const link=await auth.issueSetupToken(accountId,owner.userId);
   let access=await getAccessResponse(owner);access=await mutateAccess(owner,{action:'set_status',id:accountId,active:false,expectedRevision:access.revision!});
   assert.equal((await query('SELECT token_hash FROM auth_sessions WHERE user_id=$1',[staffId])).rowCount,0);
   assert.equal((await query('SELECT token_hash FROM auth_setup_tokens WHERE crm_account_id=$1',[accountId])).rowCount,0);
   await assert.rejects(auth.loginPassword('auth-staff@example.test',nextStaffPassword),/không đúng/);
   await assert.rejects(auth.issueSetupToken(accountId,owner.userId),/hoạt động/);
   await mutateAccess(owner,{action:'set_status',id:accountId,active:true,expectedRevision:access.revision!});
   assert.equal((await query('SELECT token_hash FROM auth_sessions WHERE token_hash=$1',[tokenHash(staffToken)])).rowCount,0);
   await assert.rejects(auth.activatePassword(link,nextStaffPassword),/hết hạn/);
  });
  await t.test('expired setup token is rejected',async()=>{
   const token=await auth.issueSetupToken(accountId,owner.userId);await query("UPDATE auth_setup_tokens SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",[tokenHash(token)]);
   await assert.rejects(auth.activatePassword(token,nextStaffPassword),/hết hạn/);
  });
  await t.test('concurrent activation and replacement serialize without a lock-order failure',async()=>{
   const token=await auth.issueSetupToken(accountId,owner.userId);
   const results=await Promise.allSettled([auth.activatePassword(token,nextStaffPassword),auth.issueSetupToken(accountId,owner.userId)]);
   for(const result of results)if(result.status==='rejected')assert.ok(result.reason instanceof auth.AuthError&&result.reason.status===400);
   assert.equal(results[1].status,'fulfilled');
   assert.equal((await query('SELECT token_hash FROM auth_setup_tokens WHERE crm_account_id=$1',[accountId])).rowCount,1);
  });
  await t.test('owner recovery changes credentials while preserving identity and revokes sessions',async()=>{
   const next='fixture owner reset '+randomUUID();await auth.resetOwnerPassword(next);
   assert.equal((await query('SELECT token_hash FROM auth_sessions WHERE user_id=$1',[owner.userId])).rowCount,0);
   assert.equal((await query<{id:string}>('SELECT id FROM auth_users WHERE email=$1',[email])).rows[0].id,owner.userId);
   await assert.rejects(auth.loginPassword(email,password),/không đúng/);
   await auth.loginPassword(email,next);
  });
 }finally{await pool.end()}
});
