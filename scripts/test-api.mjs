/**
 * Real HTTP/SQL integration smoke for the standalone production build.
 * Requires a dedicated PostgreSQL test database. It resets that database.
 * The loopback scanner implements clamd's protocol, NOT antivirus detection.
 * TEST_API_DATABASE_RESET=1 TEST_API_DATABASE_URL=postgresql://.../smee_api_test node scripts/test-api.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dbUrl=process.env.TEST_API_DATABASE_URL;
if(process.env.TEST_API_DATABASE_RESET!=='1' || !dbUrl)throw new Error('Set TEST_API_DATABASE_RESET=1 and TEST_API_DATABASE_URL to a disposable local database.');
const parsed=new URL(dbUrl);
if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname) || !/_api_test$/.test(parsed.pathname))throw new Error('Refusing to reset a non-loopback database or database whose name does not end in _api_test.');
const port=Number(process.env.TEST_API_PORT||5180);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid TEST_API_PORT.');
const origin=`http://127.0.0.1:${port}`;
const ownerEmail='owner-http@example.test',ownerPassword=randomBytes(24).toString('hex');
const employeePassword=randomBytes(24).toString('hex');
const pool=new pg.Pool({connectionString:dbUrl,max:3});
const uploadDir=await mkdtemp(join(tmpdir(),'smee-http-uploads-'));
let app,appLogs='',scanMode='clean',checks=0;
const sockets=new Set();
const scanner=createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  let pending=Buffer.alloc(0),started=false,body=Buffer.alloc(0);
  socket.on('data',chunk=>{
    pending=Buffer.concat([pending,chunk]);
    if(!started){const end=pending.indexOf(0);if(end<0)return;if(pending.subarray(0,end).toString()!=='zINSTREAM'){socket.destroy();return;}pending=pending.subarray(end+1);started=true;}
    while(pending.length>=4){
      const size=pending.readUInt32BE(0);if(size>65536){socket.destroy();return;}if(pending.length<size+4)return;
      if(size===0){
        if(scanMode==='unavailable'){socket.destroy();return;}
        const reply=scanMode==='malware'?'stream: Test-Signature FOUND\0':scanMode==='error'?'stream: temporary ERROR\0':'stream: OK\0';
        socket.end(reply);return;
      }
      body=Buffer.concat([body,pending.subarray(4,4+size)]);pending=pending.subarray(4+size);
      if(body.length>11*1024*1024){socket.destroy();return;}
    }
  });
});
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function child(command,args,env,input){
  const proc=spawn(command,args,{cwd:root,env,stdio:['pipe','pipe','pipe']});let out='';
  proc.stdout.on('data',data=>out+=data);proc.stderr.on('data',data=>out+=data);
  const result=new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('exit',code=>code===0?resolve(out):reject(new Error(`Child exited ${code}: ${out.slice(-2000)}`)));});
  proc.stdin.end(input);return result;
}
async function request(path,{method='GET',cookie,body,headers={},form}={}){
  const merged={...headers};if(cookie)merged.Cookie=cookie;
  if(method!=='GET' && !('Origin' in merged))merged.Origin=origin;
  if(body!==undefined)merged['Content-Type']='application/json';
  const response=await fetch(origin+path,{method,headers:merged,body:form??(body===undefined?undefined:JSON.stringify(body)),redirect:'manual',signal:AbortSignal.timeout(15000)});
  const bytes=new Uint8Array(await response.arrayBuffer());
  const text=new TextDecoder().decode(bytes);let data;
  try{data=JSON.parse(text)}catch{data=text}
  return{response,status:response.status,data,bytes};
}
function status(result,expected){assert.equal(result.status,expected,`HTTP ${result.status}; expected ${expected}; ${typeof result.data==='string'?result.data.slice(0,120):JSON.stringify(result.data).slice(0,300)}`);return result.data;}
async function check(label,fn){await fn();checks++;console.log(`ok ${checks} - ${label}`);}
async function login(email,password,headers={}){const result=await request('/api/auth/login',{method:'POST',body:{email,password},headers});status(result,200);const setCookie=result.response.headers.get('set-cookie');assert.ok(setCookie);return{cookie:setCookie.split(';',1)[0],setCookie};}
async function workspace(cookie){return status(await request('/api/crm?mode=live',{cookie}),200);}
async function mutate(cookie,command){const current=await workspace(cookie);return request('/api/crm?mode=live',{method:'POST',cookie,body:{expectedRevision:current.revision,...command}});}
async function accounts(cookie){return status(await request('/api/access',{cookie}),200);}
async function changeAccount(cookie,command){const current=await accounts(cookie);return request('/api/access',{method:'POST',cookie,body:{expectedRevision:current.revision,...command}});}
async function upload(cookie,bytes,type='image/png',name='pixel.png'){
  const form=new FormData();form.append('file',new Blob([bytes],{type}),name);return request('/api/uploads',{method:'POST',cookie,form});
}
try{
  await access(resolve(root,'.next/standalone/server.js'));
  await new Promise((resolve,reject)=>{scanner.once('error',reject);scanner.listen(0,'127.0.0.1',resolve)});
  const env={...process.env,NODE_ENV:'production',DATABASE_URL:dbUrl,APP_ORIGIN:origin,SMEE_OWNER_EMAIL:ownerEmail,PORT:String(port),HOSTNAME:'127.0.0.1',UPLOAD_DIR:uploadDir,CLAMAV_REQUIRED:'true',CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:String(scanner.address().port),TRUST_PROXY:'false',NEXT_TELEMETRY_DISABLED:'1'};
  await child(process.execPath,['scripts/migrate.mjs'],env);
  await pool.query('TRUNCATE crm_files,crm_access_accounts,crm_access_control,crm_access_audit,crm_workspaces,auth_users,auth_security_events,security_rate_limits CASCADE');
  await child(process.execPath,['--import','tsx','scripts/create-owner.ts','--stdin'],env,JSON.stringify({email:ownerEmail,password:ownerPassword,displayName:'HTTP QA Owner'}));
  app=spawn(process.execPath,[resolve(root,'.next/standalone/server.js')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',data=>{appLogs=(appLogs+data).slice(-12000)});app.stderr.on('data',data=>{appLogs=(appLogs+data).slice(-12000)});
  let started=false;
  for(let i=0;i<100;i++){if(app.exitCode!==null)throw new Error('App exited: '+appLogs);try{if((await request('/api/health')).status===200){started=true;break}}catch{}await sleep(100)}
  assert.ok(started,'Production app did not become healthy.');
  let owner,teleA,teleB,accountA,accountB,memberA,memberB,customerA,customerB,customerC,fileUrl;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1cAAAAASUVORK5CYII=','base64');
  await check('anonymous and forged Sites identity cannot access CRM',async()=>{
    status(await request('/api/crm?mode=live'),401);
    status(await request('/api/crm?mode=live',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':ownerEmail,'x-user-id':'owner'}}),401);
  });
  await check('login uses HttpOnly, SameSite, path-scoped session cookie',async()=>{
    owner=await login(ownerEmail,ownerPassword);
    assert.match(owner.setCookie,/HttpOnly/i);assert.match(owner.setCookie,/SameSite=Lax/i);assert.match(owner.setCookie,/Path=\//i);
    assert.match(owner.cookie,/^smee-session=[a-f0-9]{64}$/);
    assert.doesNotMatch(owner.setCookie,/;\s*Secure/i); // loopback HTTP fixture; HTTPS is checked separately below.
    assert.equal((await accounts(owner.cookie)).viewer.role,'owner');
  });
  await check('cross-origin and missing-origin writes are rejected',async()=>{
    status(await request('/api/auth/login',{method:'POST',body:{email:ownerEmail,password:ownerPassword},headers:{Origin:'https://evil.example.test'}}),403);
    status(await request('/api/crm?mode=live',{method:'POST',cookie:owner.cookie,body:{},headers:{Origin:''}}),403);
  });
  await check('HTML responses carry nonce CSP and frame protection',async()=>{
    const page=await request('/login');status(page,200);const policy=page.response.headers.get('content-security-policy')||'';
    assert.match(policy,/script-src[^;]*'nonce-[^']+'/);assert.match(policy,/frame-ancestors 'none'/);assert.doesNotMatch(policy,/unsafe-eval/);
    const nonce=policy.match(/'nonce-([^']+)'/)[1];assert.ok(page.data.includes(`nonce="${nonce}"`));
    assert.equal(page.response.headers.get('x-frame-options'),'DENY');
  });
  await check('owner creates two staff members and telesales accounts',async()=>{
    let response=status(await mutate(owner.cookie,{action:'create',collection:'team',data:{name:'HTTP QA A',email:'a-http@example.test',role:'Telesales',color:'#ee3322'}}),200);
    memberA=response.data.team.find(member=>member.email==='a-http@example.test').id;
    response=status(await mutate(owner.cookie,{action:'create',collection:'team',data:{name:'HTTP QA B',email:'b-http@example.test',role:'Telesales',color:'#ee3322'}}),200);
    memberB=response.data.team.find(member=>member.email==='b-http@example.test').id;
    let access=status(await changeAccount(owner.cookie,{action:'upsert',email:'a-http@example.test',teamMemberId:memberA,role:'telesales',active:true}),200);
    accountA=access.accounts.find(account=>account.email==='a-http@example.test').id;
    access=status(await changeAccount(owner.cookie,{action:'upsert',email:'b-http@example.test',teamMemberId:memberB,role:'telesales',active:true}),200);
    accountB=access.accounts.find(account=>account.email==='b-http@example.test').id;
  });
  await check('setup links activate passwords once and enable employee login',async()=>{
    for(const [account,email,key] of [[accountA,'a-http@example.test','a'],[accountB,'b-http@example.test','b']]){
      const invite=status(await request('/api/auth/invite',{method:'POST',cookie:owner.cookie,body:{accountId:account}}),200);
      const url=new URL(invite.url);assert.equal(url.origin,origin);assert.equal(url.search,'');const token=new URLSearchParams(url.hash.slice(1)).get('token');assert.match(token,/^[a-f0-9]{64}$/);
      status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),200);
      status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),400);
      const signed=await login(email,employeePassword);if(key==='a')teleA=signed;else teleB=signed;
    }
    status(await request('/api/auth/invite',{method:'POST',cookie:teleA.cookie,body:{accountId:accountB}}),403);
  });
  await check('import normalizes phones and duplicate batch rolls back completely',async()=>{
    const response=status(await mutate(owner.cookie,{action:'import_customers',data:{owner:'member-admin',sourceFile:'http-qa.xlsx',rows:[{name:'HTTP Customer A',phone:'0901111222'},{name:'HTTP Customer B',phone:'0902222333'},{name:'HTTP Customer C',phone:'0903333444'}]}}),200);
    [customerA,customerB,customerC]=['HTTP Customer A','HTTP Customer B','HTTP Customer C'].map(name=>response.data.customers.find(customer=>customer.name===name).id);
    assert.equal(response.data.customers.find(customer=>customer.id===customerA).phone,'+84901111222');
    status(await mutate(owner.cookie,{action:'import_customers',data:{owner:'member-admin',sourceFile:'dup.xlsx',rows:[{name:'Must Roll Back',phone:'0904444555'},{name:'Duplicate',phone:'+84 901 111 222'}]}}),400);
    const after=await workspace(owner.cookie);assert.equal(after.revision,response.revision);assert.equal(after.data.customers.length,3);
  });
  await check('bulk assignment returns only each employee assigned customers',async()=>{
    status(await mutate(owner.cookie,{action:'distribute_customers',data:{assignments:[{owner:memberA,ids:[customerA,customerB]},{owner:memberB,ids:[customerC]}],note:'HTTP QA handoff',nextFollowUp:'2030-01-01',allowReassign:false}}),200);
    assert.deepEqual((await workspace(teleA.cookie)).data.customers.map(c=>c.id).sort(),[customerA,customerB].sort());
    assert.deepEqual((await workspace(teleB.cookie)).data.customers.map(c=>c.id),[customerC]);
    status(await mutate(teleA.cookie,{action:'add_customer_note',id:customerC,data:{body:'forbidden'}}),403);
    status(await mutate(teleA.cookie,{action:'distribute_customers',data:{assignments:[]}}),403);
    status(await request('/api/export?mode=live',{cookie:teleA.cookie}),403);
    assert.equal(status(await request('/api/export?mode=live',{cookie:owner.cookie}),200).format,'smee-crm-backup');
  });
  await check('valid scanned uploads stay private and staff download follows customer scope',async()=>{
    const saved=status(await upload(owner.cookie,png),201);fileUrl=saved.url;
    status(await mutate(owner.cookie,{action:'update',collection:'customers',id:customerA,data:{avatarUrl:fileUrl}}),200);
    assert.deepEqual((await request(fileUrl,{cookie:owner.cookie})).bytes,new Uint8Array(png));
    status(await request(fileUrl,{cookie:teleA.cookie}),200);status(await request(fileUrl,{cookie:teleB.cookie}),404);status(await request(fileUrl),401);
    status(await upload(teleA.cookie,png),403);
    const headers=(await request(fileUrl,{cookie:owner.cookie})).response.headers;
    assert.equal(headers.get('x-content-type-options'),'nosniff');assert.equal(headers.get('cross-origin-resource-policy'),'same-origin');
  });
  await check('bad signature and mismatched MIME uploads are rejected before storage',async()=>{
    const before=(await pool.query('SELECT count(*)::integer AS count FROM crm_files')).rows[0].count;
    status(await upload(owner.cookie,Buffer.from('<script>alert(1)</script>'),'image/png'),415);
    status(await upload(owner.cookie,png,'application/pdf','fake.pdf'),415);
    assert.equal((await pool.query('SELECT count(*)::integer AS count FROM crm_files')).rows[0].count,before);
  });
  await check('malware, scanner errors and unavailable scanner fail closed',async()=>{
    const before=(await pool.query('SELECT count(*)::integer AS count FROM crm_files')).rows[0].count;
    scanMode='malware';status(await upload(owner.cookie,png),422);
    scanMode='error';status(await upload(owner.cookie,png),503);
    scanMode='unavailable';status(await upload(owner.cookie,png),503);
    scanMode='clean';assert.equal((await pool.query('SELECT count(*)::integer AS count FROM crm_files')).rows[0].count,before);
  });
  await check('chunked oversized JSON is rejected without trusting Content-Length',async()=>{
    const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"pad":"'+'x'.repeat(21_000)+'"}'));controller.close()}});
    const response=await fetch(origin+'/api/access',{method:'POST',headers:{Origin:origin,Cookie:owner.cookie,'Content-Type':'application/json'},body:stream,duplex:'half'});
    assert.equal(response.status,413);await response.arrayBuffer();
  });
  await check('disabling employee revokes sessions and blocks telesales allocation',async()=>{
    const invite=status(await request('/api/auth/invite',{method:'POST',cookie:owner.cookie,body:{accountId:accountB}}),200);
    const token=new URLSearchParams(new URL(invite.url).hash.slice(1)).get('token');
    status(await changeAccount(owner.cookie,{action:'set_status',id:accountB,active:false}),200);
    status(await request('/api/crm?mode=live',{cookie:teleB.cookie}),401);
    status(await mutate(owner.cookie,{action:'distribute_customers',data:{assignments:[{owner:memberB,ids:[customerA]}],note:'must fail',nextFollowUp:'2030-01-01',allowReassign:true}}),400);
    status(await changeAccount(owner.cookie,{action:'set_status',id:accountB,active:true}),200);
    status(await request('/api/crm?mode=live',{cookie:teleB.cookie}),401);
    status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),400);
    teleB=await login('b-http@example.test',employeePassword);
  });
  await check('reassignment immediately removes old employee record and file access',async()=>{
    status(await mutate(owner.cookie,{action:'distribute_customers',data:{assignments:[{owner:memberB,ids:[customerA]}],note:'HTTP transfer',nextFollowUp:'2030-01-01',allowReassign:true}}),200);
    assert.deepEqual((await workspace(teleA.cookie)).data.customers.map(c=>c.id),[customerB]);
    status(await request(fileUrl,{cookie:teleA.cookie}),404);status(await request(fileUrl,{cookie:teleB.cookie}),200);
    status(await mutate(teleA.cookie,{action:'add_customer_note',id:customerA,data:{body:'forbidden after transfer'}}),403);
  });
  await check('password changes revoke old sessions and require new password',async()=>{
    const nextPassword=randomBytes(24).toString('hex');
    status(await request('/api/auth/password',{method:'POST',cookie:teleA.cookie,body:{currentPassword:employeePassword,newPassword:nextPassword}}),200);
    status(await request('/api/crm?mode=live',{cookie:teleA.cookie}),401);
    status(await request('/api/auth/login',{method:'POST',body:{email:'a-http@example.test',password:employeePassword}}),401);
    teleA=await login('a-http@example.test',nextPassword);
    status(await request('/api/auth/logout',{method:'POST',cookie:teleA.cookie}),200);
    status(await request('/api/crm?mode=live',{cookie:teleA.cookie}),401);
  });
  await check('credential throttle blocks repeated failed logins',async()=>{
    await pool.query('DELETE FROM security_rate_limits');
    for(let i=0;i<10;i++)status(await request('/api/auth/login',{method:'POST',body:{email:'unknown-rate@example.test',password:'wrong-but-long-password'}}),401);
    const limited=await request('/api/auth/login',{method:'POST',body:{email:'unknown-rate@example.test',password:'wrong-but-long-password'}});status(limited,429);assert.equal(limited.response.headers.get('retry-after'),'60');
  });
  // Verify HTTPS cookie naming/flags through the actual compiled production route.
  await check('HTTPS configuration produces Secure __Host- session cookies',async()=>{
    await pool.query('DELETE FROM security_rate_limits');
    app.kill('SIGTERM');await new Promise(resolve=>app.once('exit',resolve));
    const secureEnv={...env,APP_ORIGIN:'https://crm.example.test'};
    app=spawn(process.execPath,[resolve(root,'.next/standalone/server.js')],{cwd:root,env:secureEnv,stdio:['ignore','pipe','pipe']});
    app.stdout.on('data',data=>{appLogs=(appLogs+data).slice(-12000)});app.stderr.on('data',data=>{appLogs=(appLogs+data).slice(-12000)});
    let ready=false;for(let i=0;i<100;i++){try{if((await request('/api/health')).status===200){ready=true;break}}catch{}await sleep(100)}assert.ok(ready);
    const signed=await login(ownerEmail,ownerPassword,{Origin:'https://crm.example.test'});
    assert.match(signed.cookie,/^__Host-smee-session=/);assert.match(signed.setCookie,/;\s*Secure/i);assert.match(signed.setCookie,/HttpOnly/i);assert.match(signed.setCookie,/SameSite=Lax/i);
  });
  console.log(`PASS ${checks}/${checks} HTTP scenarios against PostgreSQL. Scanner protocol mocked; real ClamAV engine and public TLS/DNS are not covered.`);
}catch(error){console.error('HTTP integration failed:',error instanceof Error?error.message:error);console.error('App log tail:',appLogs.slice(-5000));process.exitCode=1;}
finally{
  if(app && app.exitCode===null){app.kill('SIGTERM');await Promise.race([new Promise(resolve=>app.once('exit',resolve)),sleep(3000)]);if(app.exitCode===null)app.kill('SIGKILL');}
  for(const socket of sockets)socket.destroy();
  if(scanner.listening)await new Promise(resolve=>scanner.close(resolve));
  await pool.end();await rm(uploadDir,{recursive:true,force:true});
}
