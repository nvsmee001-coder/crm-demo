/**
 * Real HTTP/SQL integration smoke for the standalone production build.
 * Requires a dedicated PostgreSQL test database. It resets that database.
 * The loopback scanner implements clamd's protocol, NOT antivirus detection.
 * TEST_API_DATABASE_RESET=1 TEST_API_DATABASE_URL=postgresql://.../smee_api_test node scripts/test-api.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
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
function codeForSetup(secret,time=Date.now()){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits=0,value=0;
  const material=[];
  for(const char of secret){
    value=(value<<5)|alphabet.indexOf(char);bits+=5;
    if(bits>=8){bits-=8;material.push((value>>bits)&255);}
  }
  const step=Buffer.alloc(8);
  step.writeBigUInt64BE(BigInt(Math.floor(time/30_000)));
  const digest=createHmac('sha1',Buffer.from(material)).update(step).digest();
  const offset=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');
}
async function startApp(env){
  if(app?.exitCode===null){app.kill('SIGTERM');await new Promise(resolve=>app.once('exit',resolve));}
  app=spawn(process.execPath,[resolve(root,'.next/standalone/server.js')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',data=>{appLogs=(appLogs+data).slice(-12000)});app.stderr.on('data',data=>{appLogs=(appLogs+data).slice(-12000)});
  for(let i=0;i<100;i++){
    if(app.exitCode!==null)throw new Error('App exited: '+appLogs);
    try{if((await request('/api/health')).status===200)return;}catch{}
    await sleep(100);
  }
  assert.fail('Production app did not become healthy.');
}
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
async function lockAccount(cookie,accountId) {
  const preview=status(await request('/api/admin/offboarding?accountId='+accountId,{cookie}),200);
  return request('/api/admin/offboarding',{method:'POST',cookie,body:{action:'lock',accountId,accessRevision:preview.accessRevision,
    password:ownerPassword,reason:'HTTP test access revocation'}});
}
async function upload(cookie,bytes,type='image/png',name='pixel.png'){
  const form=new FormData();form.append('file',new Blob([bytes],{type}),name);return request('/api/uploads',{method:'POST',cookie,form});
}
try{
  await access(resolve(root,'.next/standalone/server.js'));
  await new Promise((resolve,reject)=>{scanner.once('error',reject);scanner.listen(0,'127.0.0.1',resolve)});
  const env={...process.env,NODE_ENV:'production',DATABASE_URL:dbUrl,APP_ORIGIN:origin,SMEE_OWNER_EMAIL:ownerEmail,SMEE_ENABLE_DEMO:'false',
    SMEE_REQUIRE_MFA:'false',SMEE_MFA_KEY:randomBytes(32).toString('hex'),PORT:String(port),HOSTNAME:'127.0.0.1',
    UPLOAD_DIR:uploadDir,CLAMAV_REQUIRED:'true',CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:String(scanner.address().port),TRUST_PROXY:'false',NEXT_TELEMETRY_DISABLED:'1'};
  await child(process.execPath,['scripts/migrate.mjs'],env);
  await pool.query('TRUNCATE crm_mutation_requests,crm_files,crm_access_accounts,crm_access_control,crm_access_audit,crm_workspaces,auth_users,auth_security_events,security_rate_limits CASCADE');
  await child(process.execPath,['--import','tsx','scripts/create-owner.ts','--stdin'],env,JSON.stringify({email:ownerEmail,password:ownerPassword,displayName:'HTTP QA Owner'}));
  await startApp(env);
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
  await check('only company data is accessible with demo disabled', async () => {
    const cookie=owner.cookie;
    assert.equal(status(await request('/api/crm',{cookie}),200).mode,'live');
    assert.equal(status(await request('/api/export',{cookie}),200).mode,'live');
    status(await request('/api/crm?mode=demo',{cookie}),403);
    status(await request('/api/crm?mode=demo',{cookie,method:'POST',body:{action:'update_settings',expectedRevision:0,data:{companyName:'Must not write'}}}),403);
    status(await request('/api/export?mode=demo',{cookie}),403);
    status(await request('/quotes/missing?mode=demo',{cookie}),404);
    assert.equal((await pool.query("SELECT id FROM crm_workspaces WHERE id='smee:demo'")).rowCount,0);
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
  await check('admin page and directory are available only to the signed-in owner', async () => {
    const guestPage = await request('/admin');
    status(guestPage, 307);
    const signIn = new URL(guestPage.response.headers.get('location'), origin);
    assert.equal(signIn.pathname, '/login');
    assert.equal(signIn.searchParams.get('returnTo'), '/admin');
    status(await request('/api/admin'), 401);

    const ownerPage = status(await request('/admin', {cookie: owner.cookie}), 200);
    assert.ok(ownerPage.includes('Quản trị hệ thống'));
    const dashboard = status(await request('/api/admin', {cookie: owner.cookie}), 200);
    assert.equal(dashboard.access.viewer.role, 'owner');
    assert.equal(dashboard.access.accounts.length, 2);
    assert.ok(dashboard.events.some(event => event.action === 'account_created'));

    const employeePage = await request('/admin', {cookie: teleA.cookie});
    status(employeePage, 307);
    assert.equal(new URL(employeePage.response.headers.get('location'), origin).pathname, '/');
    status(await request('/api/admin', {cookie: teleA.cookie}), 403);
  });
  await check('import normalizes phones and duplicate batch rolls back completely',async()=>{
    const response=status(await mutate(owner.cookie,{action:'import_customers',data:{owner:'member-admin',sourceFile:'http-qa.xlsx',rows:[{name:'HTTP Customer A',phone:'0901111222'},{name:'HTTP Customer B',phone:'0902222333'},{name:'HTTP Customer C',phone:'0903333444'}]}}),200);
    [customerA,customerB,customerC]=['HTTP Customer A','HTTP Customer B','HTTP Customer C'].map(name=>response.data.customers.find(customer=>customer.name===name).id);
    assert.equal(response.data.customers.find(customer=>customer.id===customerA).phone,'+84901111222');
    status(await mutate(owner.cookie,{action:'import_customers',data:{owner:'member-admin',sourceFile:'dup.xlsx',rows:[{name:'Must Roll Back',phone:'0904444555'},{name:'Duplicate',phone:'+84 901 111 222'}]}}),400);
    const after=await workspace(owner.cookie);assert.equal(after.revision,response.revision);assert.equal(after.data.customers.length,3);
  });
  await check('employee Excel preview hides foreign customers and imports only self-owned prospects',async()=>{
    const rows=[
      {rowNumber:2,data:{name:'HTTP Staff Prospect',phone:'0906666777'}},
      {rowNumber:3,data:{name:'HTTP Duplicate Input',phone:'0901111222'}},
    ];
    const preview=status(await request('/api/crm/import-preview',{method:'POST',cookie:teleA.cookie,body:{rows}}),200);
    assert.deepEqual(preview.rows.map(row=>row.status),['ready','duplicate']);
    assert.ok(!JSON.stringify(preview).includes('HTTP Customer A'));
    assert.ok(!('owner' in preview.rows[0].customer));
    status(await request('/api/crm/import-preview',{method:'POST',cookie:teleA.cookie,body:{rows:[{rowNumber:2,data:{...rows[0].data,owner:memberB}}]}}),403);
    const saved=status(await mutate(teleA.cookie,{action:'import_prospects',data:{sourceFile:'staff-http.xlsx',rows:[rows[0]]}}),200);
    const id=saved.createdCustomerIds[0],prospect=saved.data.customers.find(customer=>customer.id===id);
    assert.equal(prospect.owner,memberA);assert.equal(prospect.telesalesOwner,memberA);assert.equal(prospect.prospectedBy,memberA);
    assert.ok(!(await workspace(teleB.cookie)).data.customers.some(customer=>customer.id===id));
    assert.ok((await workspace(owner.cookie)).data.customers.some(customer=>customer.id===id));
    status(await mutate(owner.cookie,{action:'delete',collection:'customers',id}),200);
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
  await check('unchanged reads transfer no body and keep the validator private to each viewer',async()=>{
    const first=await request('/api/crm?mode=live',{cookie:teleA.cookie});
    assert.ok(status(first,200).data.customers.length);
    const tag=first.response.headers.get('etag');
    assert.ok(tag);
    const headers={'If-None-Match':tag};
    const same=await request('/api/crm?mode=live',{cookie:teleA.cookie,headers});
    status(same,304);
    assert.equal(same.bytes.length,0);
    assert.match(same.response.headers.get('cache-control'),/private/);
    assert.equal(status(await request('/api/crm?mode=live',{cookie:teleB.cookie,headers}),200).data.customers[0].id,customerC);
    status(await request('/api/crm?mode=demo',{cookie:teleA.cookie,headers}),403);
  });
  await check('customer directory paginates and filters only records in the signed-in role scope', async ()=>{
    const path='/api/crm/customers';
    const cookie=teleA.cookie;
    status(await request(path),401);
    status(await request(path+'?limit=101',{cookie}),400);
    status(await request(path+'?mode=demo',{cookie:owner.cookie}),403);
    const first=status(await request(path+'?limit=1',{cookie}),200);
    assert.deepEqual(first.customers.map(customer=>customer.id),[customerA]);
    assert.ok(first.nextCursor);
    assert.equal(first.customers[0].notesLog,undefined);
    const next=status(await request(path+'?limit=1&after='+encodeURIComponent(first.nextCursor),{cookie}),200);
    assert.deepEqual(next.customers.map(customer=>customer.id),[customerB]);
    assert.equal(next.nextCursor,null);
    assert.deepEqual(status(await request(path+'?q=HTTP%20Customer%20C',{cookie}),200).customers,[]);
    assert.deepEqual(status(await request(path+'?q=HTTP%20Customer%20C',{cookie:owner.cookie}),200).customers.map(customer=>customer.id),[customerC]);
  });
  await check('management directory reads limited data, full profiles on demand and filtered export', async ()=>{
    const path='/api/crm/customers',cookie=owner.cookie;
    const shell=await request('/api/crm?scope=customers',{cookie});
    assert.equal(status(shell,200).scope,'customers');
    assert.equal(shell.data.data.customers.length,0);
    assert.ok(shell.data.data.team.length);
    assert.equal(status(await request('/api/crm',{cookie,headers:{'If-None-Match':shell.response.headers.get('etag')}}),200).data.customers.length,3);
    status(await request('/api/crm?scope=customers',{cookie:teleA.cookie}),403);

    const list=status(await request(path+'?view=directory&page=0&q=0901111222',{cookie}),200);
    assert.equal(list.counts.all,3);
    assert.equal(list.total,1);
    assert.deepEqual(list.customers.map(customer=>customer.id),[customerA]);
    assert.equal(list.customers[0].notesLog,undefined);
    const clamped=status(await request(path+'?view=directory&page=999&q=0901111222',{cookie}),200);
    assert.equal(clamped.page,0);
    assert.deepEqual(clamped.customers,list.customers);
    const noResults=status(await request(path+'?view=directory&page=999&q=no-such-customer',{cookie}),200);
    assert.equal(noResults.total,0);
    assert.equal(noResults.page,0);
    assert.deepEqual(noResults.customers,[]);
    const profile=status(await request(path+'?view=profile&id='+customerA,{cookie}),200);
    assert.deepEqual(profile.data.customers.map(customer=>customer.id),[customerA]);
    assert.ok(Array.isArray(profile.data.customers[0].interactions));
    status(await request(path+'?view=profile&id='+customerA,{cookie:teleA.cookie}),403);
    status(await request(path+'?view=profile&id=missing',{cookie}),404);
    status(await request(path,{cookie,method:'POST',body:{action:'select',filters:'q=0901111222',revision:list.revision-1}}),409);
    const selected=status(await request(path,{cookie,method:'POST',body:{action:'select',filters:'q=0901111222',revision:list.revision}}),200);
    assert.deepEqual(selected.customers.map(customer=>customer.id),[customerA]);
    const exported=status(await request(path,{cookie,method:'POST',body:{action:'export',ids:[customerB]}}),200);
    assert.deepEqual(exported.customers.map(customer=>customer.id),[customerB]);
    status(await request(path,{cookie:teleA.cookie,method:'POST',body:{action:'export'}}),403);
  });
  await check('owner Excel preview sees duplicates beyond the page and scoped commit returns imported IDs',async()=>{
    const cookie=owner.cookie, rows=[{rowNumber:2,data:{name:'Duplicate',phone:'0901111222'}},
      {rowNumber:3,data:{name:'Scoped Excel New',phone:'0908888777'}}];
    const preview=status(await request('/api/crm/import-preview',{cookie,method:'POST',body:{rows,owner:'member-admin'}}),200);
    assert.deepEqual(preview.rows.map(row=>row.status),['duplicate','ready']);
    const saved=status(await request('/api/crm?scope=customers',{cookie,method:'POST',body:{action:'import_customers',expectedRevision:preview.revision,
      data:{owner:'member-admin',sourceFile:'scoped.xlsx',rows:[preview.rows[1].customer]}}}),200);
    const [id]=saved.createdCustomerIds;
    assert.ok(id);
    assert.equal(saved.data.customers.length,0);
    const selected=status(await request('/api/crm/customers',{cookie,method:'POST',body:{action:'select',ids:[id]}}),200);
    assert.equal(selected.customers[0].name,'Scoped Excel New');
    status(await mutate(cookie,{action:'delete',collection:'customers',id}),200);
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
    const ownerTag=(await request('/api/crm?mode=live',{cookie:owner.cookie})).response.headers.get('etag');
    const oldTag=(await request('/api/crm?mode=live',{cookie:teleB.cookie})).response.headers.get('etag');
    const invite=status(await request('/api/auth/invite',{method:'POST',cookie:owner.cookie,body:{accountId:accountB}}),200);
    const token=new URLSearchParams(new URL(invite.url).hash.slice(1)).get('token');
    status(await changeAccount(owner.cookie,{action:'set_status',id:accountB,active:false}),400);
    status(await lockAccount(owner.cookie,accountB),200);
    const changed=status(await request('/api/crm?mode=live',{cookie:owner.cookie,headers:{'If-None-Match':ownerTag}}),200);
    assert.ok(!changed.telesalesAssignees.some(row=>row.id===memberB));
    status(await request('/api/crm?mode=live',{cookie:teleB.cookie,headers:{'If-None-Match':oldTag}}),401);
    status(await request('/api/crm?mode=live',{cookie:teleB.cookie}),401);
    status(await mutate(owner.cookie,{action:'distribute_customers',data:{assignments:[{owner:memberB,ids:[customerA]}],note:'must fail',nextFollowUp:'2030-01-01',allowReassign:true}}),400);
    status(await changeAccount(owner.cookie,{action:'set_status',id:accountB,active:true}),200);
    status(await request('/api/crm?mode=live',{cookie:teleB.cookie}),401);
    status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),400);
    teleB=await login('b-http@example.test',employeePassword);
  });
  await check('reassignment immediately removes old employee record and file access',async()=>{
    const oldTag=(await request('/api/crm?mode=live',{cookie:teleA.cookie})).response.headers.get('etag');
    status(await mutate(owner.cookie,{action:'distribute_customers',data:{assignments:[{owner:memberB,ids:[customerA]}],note:'HTTP transfer',nextFollowUp:'2030-01-01',allowReassign:true}}),200);
    const changed=status(await request('/api/crm?mode=live',{cookie:teleA.cookie,headers:{'If-None-Match':oldTag}}),200);
    assert.deepEqual(changed.data.customers.map(c=>c.id),[customerB]);
    status(await request(fileUrl,{cookie:teleA.cookie}),404);status(await request(fileUrl,{cookie:teleB.cookie}),200);
    status(await mutate(teleA.cookie,{action:'add_customer_note',id:customerA,data:{body:'forbidden after transfer'}}),403);
  });
  await check('receipt ledger persists owner writes while manager and staff remain read-restricted',async()=>{
    const initial=await workspace(owner.cookie);
    const created=status(await mutate(owner.cookie,{action:'create',collection:'projects',data:{
      name:'HTTP Ledger Contract',customerId:customerA,serviceId:initial.data.services[0].id,
      owner:'member-admin',budget:1000000,cost:0,scope:'HTTP collection fixture',
    }}),200);
    const id=created.data.projects.find(project=>project.name==='HTTP Ledger Contract').id;
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
    status(await mutate(owner.cookie,{action:'open_project_ledger',id,data:{openingAmount:200000}}),400);
    status(await mutate(owner.cookie,{action:'confirm_legacy_contract',id,data:{number:'HD-LEDGER-1',signedOn:today,budget:1000000,evidence:'Đối chiếu hợp đồng lưu trước đó'}}),200);
    status(await mutate(owner.cookie,{action:'open_project_ledger',id,data:{openingAmount:200000}}),200);
    const paid=status(await mutate(owner.cookie,{action:'record_project_receipt',id,data:{amount:300000,date:today,reference:'HTTP-RECEIPT-1'}}),200);
    const receipt=paid.data.projects.find(project=>project.id===id).ledger.receipts.find(row=>row.reference==='HTTP-RECEIPT-1');
    assert.equal(receipt.createdBy,'HTTP QA Owner');
    const read=(await workspace(owner.cookie)).data.projects.find(project=>project.id===id);
    assert.equal(read.ledger.receipts.filter(row=>!row.voided).reduce((sum,row)=>sum+row.amount,0),500000);
    status(await mutate(teleA.cookie,{action:'record_project_receipt',id,data:{amount:1,date:today,reference:'DENIED'}}),403);
    assert.equal((await workspace(teleA.cookie)).data.projects.length,0);
    status(await changeAccount(owner.cookie,{action:'upsert',id:accountB,role:'manager'}),200);
    const manager=await login('b-http@example.test',employeePassword);
    assert.deepEqual((await workspace(manager.cookie)).data.projects.find(project=>project.id===id).ledger,read.ledger);
    status(await request('/api/admin',{cookie:manager.cookie}),403);
    status(await mutate(manager.cookie,{action:'record_project_receipt',id,data:{amount:1,date:today,reference:'DENIED'}}),403);
    status(await mutate(manager.cookie,{action:'update',collection:'projects',id,data:{budget:1500000}}),403);
    status(await mutate(owner.cookie,{action:'void_project_receipt',id,data:{receiptId:receipt.id,reason:'HTTP test correction'}}),400);
    const proposed=status(await mutate(owner.cookie,{action:'request_receipt_correction',id,data:{receiptId:receipt.id,kind:'void',reason:'HTTP test correction'}}),200);
    const correctionId=proposed.data.projects.find(project=>project.id===id).ledger.corrections[0].id;
    status(await mutate(owner.cookie,{action:'review_receipt_correction',id,data:{correctionId,decision:'approved'}}),200);
    const corrected=(await workspace(owner.cookie)).data.projects.find(project=>project.id===id);
    assert.equal(corrected.ledger.receipts.filter(row=>!row.voided).reduce((sum,row)=>sum+row.amount,0),200000);
    assert.equal(corrected.ledger.receipts.find(row=>row.id===receipt.id).voided.reason,'HTTP test correction');
    status(await mutate(owner.cookie,{action:'delete',collection:'projects',id}),400);
  });
  await check('Account quotes are versioned and only management can confirm wins and contract changes',async()=>{
    const email='account-sales@example.test';
    const granted=status(await changeAccount(owner.cookie,{action:'upsert',email,role:'account',newMember:{name:'HTTP Account Sale',jobTitle:'Sale'}}),200);
    const account=granted.accounts.find(item=>item.email===email);
    const invitation=status(await request('/api/auth/invite',{method:'POST',cookie:owner.cookie,body:{accountId:account.id}}),200);
    const token=new URLSearchParams(new URL(invitation.url).hash.slice(1)).get('token');
    status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),200);
    const sale=(await login(email,employeePassword)).cookie;
    const manager=(await login('b-http@example.test',employeePassword)).cookie;
    const created=status(await mutate(sale,{action:'create_prospect',data:{name:'Khách hàng kiểm thử hợp đồng',phone:'0901830017'}}),200);
    const customerId=created.createdCustomerId;
    const service=created.data.services.find(item=>item.active);
    const dealInput={name:'Cơ hội kiểm thử hợp đồng',customerId,serviceId:service.id,value:1100000,description:'Nhu cầu kiểm thử',nextAction:'Chuẩn bị báo giá'};
    status(await mutate(sale,{action:'create',collection:'deals',data:{...dealInput,customerId:customerA}}),403);
    status(await mutate(sale,{action:'create',collection:'deals',data:{...dealInput,owner:'member-admin'}}),403);
    status(await mutate(sale,{action:'create',collection:'deals',data:{...dealInput,stage:'Đã gửi báo giá'}}),400);
    const id=status(await mutate(sale,{action:'create',collection:'deals',data:dealInput}),200).data.deals.find(item=>item.name===dealInput.name).id;
    const quotePath=version=>`/quotes/${id}?version=${version}`;
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
    const validUntil=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const quote={lines:[{description:'Hạng mục gốc',quantity:2,unitPrice:500000},{description:'Phụ phí cố định',quantity:1,unitPrice:100000}],
      scope:'Phạm vi đã báo giá',terms:'Thanh toán chuyển khoản',validUntil,discount:100000,taxBasisPoints:800};
    status(await mutate(sale,{action:'win_deal',id}),403);
    status(await mutate(manager,{action:'win_deal',id}),400);
    status(await mutate(sale,{action:'save_quote',id,data:{...quote,validUntil:'2000-01-01'}}),400);
    let updated=status(await mutate(sale,{action:'save_quote',id,data:quote}),200).data.deals.find(item=>item.id===id);
    assert.equal(updated.owner,account.teamMemberId);
    assert.equal(updated.quotes[0].total,1080000);
    assert.equal(updated.quotes[0].status,'draft');
    status(await request(quotePath(1),{cookie:sale}),404);
    status(await mutate(sale,{action:'request_deal_win',id,data:{version:1,evidence:'Chưa duyệt'}}),400);
    status(await mutate(sale,{action:'submit_quote',id,data:{version:1}}),200);
    status(await mutate(sale,{action:'review_quote',id,data:{version:1,decision:'approved'}}),403);
    status(await mutate(manager,{action:'review_quote',id,data:{version:1,decision:'approved'}}),200);
    assert.match(status(await request(quotePath(1),{cookie:sale}),200),/Hạng mục gốc/);
    status(await request(quotePath(1),{cookie:teleA.cookie}),404);
    status(await mutate(manager,{action:'update',collection:'services',id:service.id,data:{name:'Dịch vụ đổi tên sau duyệt'}}),200);
    status(await mutate(sale,{action:'update',collection:'deals',id,data:{name:'Đổi tên cơ hội sau duyệt',value:5000000,stage:'Đang thương lượng'}}),200);
    const originalPrint=status(await request(quotePath(1),{cookie:manager}),200);
    assert.match(originalPrint,/Cơ hội kiểm thử hợp đồng/);
    assert.doesNotMatch(originalPrint,/Dịch vụ đổi tên sau duyệt|Đổi tên cơ hội sau duyệt/);
    status(await mutate(sale,{action:'save_quote',id,data:{...quote,lines:[{description:'Hạng mục sửa',quantity:1,unitPrice:2000000}]}}),200);
    status(await request(quotePath(2),{cookie:sale}),404);
    status(await mutate(sale,{action:'request_deal_win',id,data:{version:1,evidence:'Phiên bản cũ'}}),400);
    status(await mutate(sale,{action:'submit_quote',id,data:{version:2}}),200);
    status(await mutate(manager,{action:'review_quote',id,data:{version:2,decision:'returned',reason:'Cần kiểm tra số lượng'}}),200);
    status(await mutate(sale,{action:'save_quote',id,data:quote}),200);
    status(await mutate(sale,{action:'submit_quote',id,data:{version:3}}),200);
    status(await mutate(manager,{action:'review_quote',id,data:{version:3,decision:'approved'}}),200);
    updated=status(await mutate(sale,{action:'request_deal_win',id,data:{version:3,evidence:'Xác nhận đặt dịch vụ bằng văn bản'}}),200).data.deals.find(item=>item.id===id);
    assert.equal(updated.winRequests.length,1);
    const confirm={action:'review_deal_win',id,requestId:randomUUID(),data:{requestId:updated.winRequests[0].id,decision:'approved',contractNumber:'HD-HTTP-01'}};
    status(await mutate(sale,confirm),403);
    const revision=(await workspace(manager)).revision;
    const [first, second]=await Promise.all([mutate(manager,{...confirm,expectedRevision:revision}),mutate(manager,{...confirm,expectedRevision:revision})]);
    const confirmed=status(first,200);
    status(second,200);
    const project=confirmed.data.projects.find(item=>item.contract?.dealId===id);
    assert.equal(project.budget,1080000);
    assert.equal(project.contract.quoteVersion,3);
    assert.equal(project.scope,quote.scope);
    assert.equal(project.owner,memberB);
    assert.equal((await workspace(manager)).data.projects.filter(item=>item.contract?.dealId===id).length,1);
    assert.deepEqual((await workspace(sale)).data.projects,[]);
    assert.equal((await workspace(sale)).data.deals.find(item=>item.id===id).winRequests[0].contractNumber,'HD-HTTP-01');
    status(await mutate(owner.cookie,{action:'update',collection:'projects',id:project.id,data:{budget:5000000}}),400);
    status(await mutate(sale,{action:'update',collection:'deals',id,data:{value:1000000}}),400);

    const input={budget:900000,scope:'Phạm vi điều chỉnh',reason:'Có phụ lục thay đổi hạng mục'};
    const propose=async(cookie,data=input)=>status(await mutate(cookie,{action:'request_contract_change',id,data}),200).data.deals.find(item=>item.id===id).contractChanges.at(-1);
    const change=await propose(sale);
    const approveChange={action:'review_contract_change',id,data:{changeId:change.id,decision:'approved'}};
    status(await mutate(sale,approveChange),403);
    status(await mutate(owner.cookie,{action:'open_project_ledger',id:project.id,data:{openingAmount:950000,paymentDue:today}}),200);
    status(await mutate(manager,approveChange),400);
    status(await mutate(manager,{...approveChange,data:{...approveChange.data,decision:'returned',reason:'Thấp hơn số thu'}}),200);
    const newer=await propose(manager,{...input,budget:1200000});
    const approveNew={action:'review_contract_change',id,data:{changeId:newer.id,decision:'approved'}};
    status(await mutate(manager,approveNew),400);
    const adjusted=status(await mutate(owner.cookie,approveNew),200).data.projects.find(item=>item.id===project.id);
    assert.equal(adjusted.scope,input.scope);
    assert.equal(adjusted.budget,1200000);
    assert.equal(adjusted.contract.signedValue,1080000);
    assert.equal(adjusted.ledger.receipts[0].amount,950000);
  });
  await check('qualified Telesales leads pass through a private, acknowledged handoff before opportunities',async()=>{
    const tele=teleA.cookie;
    const sale=(await login('account-sales@example.test',employeePassword)).cookie;
    const manager=(await login('b-http@example.test',employeePassword)).cookie;
    const saleId=(await workspace(sale)).user.memberId;
    const email='second-sale-handoff@example.test';
    const createdAccount=status(await changeAccount(owner.cookie,{action:'upsert',email,role:'account',newMember:{name:'Sale nhận bàn giao khác',jobTitle:'Sale'}}),200);
    const other=createdAccount.accounts.find(item=>item.email===email);
    assert.ok(!(await workspace(tele)).salesAssignees.some(item=>item.id===other.teamMemberId));
    const pendingInvite=status(await request('/api/auth/invite',{method:'POST',cookie:owner.cookie,body:{accountId:other.id}}),200);
    const token=new URLSearchParams(new URL(pendingInvite.url).hash.slice(1)).get('token');
    status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),200);
    const otherSale=(await login(email,employeePassword)).cookie;

    const leadName='Lead bàn giao HTTP';
    const privateNote='GHI_CHU_RIENG_CUA_KHACH';
    const dueDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
    const followup=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const newCustomer=status(await mutate(owner.cookie,{action:'create',collection:'customers',data:{name:leadName,owner:'member-admin',phone:'0901239126',notes:privateNote}}),200);
    const id=newCustomer.data.customers.find(item=>item.name===leadName).id;
    const dealData={name:'Cơ hội trước bàn giao',customerId:id,serviceId:newCustomer.data.services[0].id,owner:'member-admin'};
    const newDeal=status(await mutate(owner.cookie,{action:'create',collection:'deals',data:dealData}),200).data.deals.find(item=>item.name===dealData.name);
    status(await mutate(owner.cookie,{action:'update',collection:'customers',id,data:{avatarUrl:fileUrl}}),200);
    const transfer={action:'transfer_to_telesales',data:{ids:[id],owner:memberA,note:'Chăm sóc lần đầu',nextFollowUp:followup}};
    status(await mutate(manager,transfer),200);
    const ask={action:'request_sales_handoff',id,data:{recipientId:saleId,dueDate,summary:'Khách đặt lịch tư vấn gói dịch vụ'}};
    status(await mutate(tele,ask),400);
    const task={action:'upsert_customer_action',id,data:{owner:memberA,type:'Công việc',title:'Theo dõi kết quả tư vấn',dueDate:followup}};
    const tasks=status(await mutate(tele,task),200).data.customers.find(item=>item.id===id).actions;
    const completed=status(await mutate(tele,{...task,data:{...task.data,title:'Việc đã thực hiện'}}),200).data.customers.find(item=>item.id===id).actions[0];
    status(await mutate(tele,{action:'complete_customer_action',id,data:{actionId:completed.id,result:'Hoàn thành từ telesales'}}),200);
    const qualified=status(await mutate(tele,{action:'log_telesales_call',id,data:{outcome:'Đặt lịch tư vấn',note:'Ghi nhận chi tiết cuộc gọi',nextFollowUp:followup,nextAction:'Chuẩn bị lịch tư vấn'}}),200);
    assert.equal(qualified.data.customers.find(item=>item.id===id).telesalesStatus,'Đủ điều kiện');
    status(await mutate(tele,{...ask,data:{...ask.data,recipientId:memberB}}),400);
    status(await mutate(tele,{...ask,data:{...ask.data,dueDate:'2000-01-01'}}),400);
    status(await mutate(manager,{action:'create',collection:'deals',data:{...dealData,name:'Cơ hội trước khi Sale nhận'}}),400);
    status(await mutate(otherSale,ask),403);
    const first=status(await mutate(tele,ask),200).salesHandoffs.find(item=>item.customerId===id);
    assert.equal(first.summary,ask.data.summary);
    assert.equal(first.toMemberId,saleId);
    assert.equal(first.dueDate,dueDate);
    status(await mutate(tele,ask),400);
    status(await mutate(manager,transfer),400);
    status(await mutate(manager,{action:'handoff_customer',id,data:{owner:saleId,note:'Không ghi đè đề nghị đang chờ'}}),400);
    status(await mutate(manager,{action:'bulk_update_customers',data:{ids:[id],owner:saleId}}),400);
    const inbox=await workspace(sale);
    assert.ok(!inbox.data.customers.some(item=>item.id===id));
    assert.ok(!inbox.data.deals.some(item=>item.customerId===id));
    assert.ok(!JSON.stringify(inbox).includes(privateNote));
    assert.equal(inbox.salesHandoffs.find(item=>item.customerId===id).customerName,leadName);
    assert.ok(!JSON.stringify(inbox.salesHandoffs).includes('+84901239126'));
    assert.ok(!(await workspace(otherSale)).salesHandoffs.some(item=>item.customerId===id));
    const accept={action:'respond_sales_handoff',id,data:{handoffId:first.id,decision:'accepted'}};
    status(await mutate(otherSale,accept),403);
    status(await mutate(manager,accept),403);
    status(await request(fileUrl,{cookie:sale}),404);
    status(await request(fileUrl,{cookie:tele}),200);
    const sendBack={...accept,data:{...accept.data,decision:'returned'}};
    status(await mutate(sale,sendBack),400);
    const returned=status(await mutate(sale,{...sendBack,data:{...sendBack.data,reason:'Cần xác nhận lịch với khách'}}),200);
    assert.ok(!returned.data.customers.some(item=>item.id===id));
    let source=await workspace(tele);
    assert.equal(source.data.customers.find(item=>item.id===id).telesalesStatus,'Đủ điều kiện');
    assert.equal(source.salesHandoffs.find(item=>item.customerId===id).resolution.reason,'Cần xác nhận lịch với khách');

    const otherRequest=status(await mutate(tele,{...ask,data:{...ask.data,recipientId:other.teamMemberId}}),200).salesHandoffs.find(item=>item.customerId===id);
    status(await lockAccount(owner.cookie,other.id),200);
    const inactiveResponse=await request('/api/crm',{method:'POST',cookie:otherSale,body:{...accept,expectedRevision:source.revision,data:{handoffId:otherRequest.id,decision:'accepted'}}});
    status(inactiveResponse,401);
    status(await mutate(manager,{action:'cancel_sales_handoff',id,data:{handoffId:otherRequest.id,reason:'Người nhận tạm ngừng'}}),200);
    status(await mutate(tele,{...ask,data:{...ask.data,recipientId:other.teamMemberId}}),400);
    const latest=status(await mutate(tele,ask),200).salesHandoffs.find(item=>item.customerId===id);
    status(await mutate(sale,accept),400);
    const version=(await workspace(sale)).revision;
    const write={...accept,requestId:randomUUID(),expectedRevision:version,data:{...accept.data,handoffId:latest.id}};
    const saved=await Promise.all([mutate(sale,write),mutate(sale,write)]);
    for(const response of saved)status(response,200);
    const after=await workspace(sale);
    const finalCustomer=after.data.customers.find(item=>item.id===id);
    assert.equal(finalCustomer.owner,saleId);
    assert.equal(finalCustomer.notes,privateNote);
    assert.equal(finalCustomer.telesalesStatus,'Đã bàn giao');
    assert.equal(finalCustomer.nextFollowUp,followup);
    assert.equal(finalCustomer.interactions[0].note,'Ghi nhận chi tiết cuộc gọi');
    assert.equal(finalCustomer.actions.find(item=>item.id===tasks[0].id).owner,saleId);
    assert.equal(finalCustomer.actions.find(item=>item.id===completed.id).owner,memberA);
    assert.equal(after.data.deals.find(item=>item.id===newDeal.id).owner,saleId);
    assert.equal(after.salesHandoffs.find(item=>item.customerId===id).resolution.decision,'accepted');
    source=await workspace(tele);
    assert.ok(!source.data.customers.some(item=>item.id===id));
    assert.equal(source.salesHandoffs.find(item=>item.customerId===id).resolution.decision,'accepted');
    status(await request(fileUrl,{cookie:tele}),404);
    status(await request(fileUrl,{cookie:sale}),200);
    status(await mutate(sale,{action:'create',collection:'deals',data:{customerId:id,serviceId:dealData.serviceId,name:'Cơ hội sau tiếp nhận'}}),200);
    const audit=(await workspace(manager)).data.activities.filter(item=>item.entityId===id);
    assert.equal(audit.filter(item=>item.kind==='respond_sales_handoff').length,2);
    assert.equal(audit.filter(item=>item.kind==='request_sales_handoff').length,3);
  });
  await check('finance reconciles through confirmed contracts and owner-approved receipt corrections',async()=>{
    const email='finance-http@example.test';
    const manager=(await login('b-http@example.test',employeePassword)).cookie;
    const granted=status(await changeAccount(owner.cookie,{action:'upsert',email,role:'finance',newMember:{name:'Tài chính HTTP',jobTitle:'Kế toán nội bộ'}}),200);
    const account=granted.accounts.find(item=>item.email===email);
    const invited=status(await request('/api/auth/invite',{method:'POST',cookie:owner.cookie,body:{accountId:account.id}}),200);
    const token=new URLSearchParams(new URL(invited.url).hash.slice(1)).get('token');
    status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),200);
    const finance=(await login(email,employeePassword)).cookie;
    const ledger=async()=>status(await request('/api/finance',{cookie:finance}),200);
    const financeWrite=async(command)=>request('/api/finance',{method:'POST',cookie:finance,body:{expectedRevision:(await ledger()).revision,...command}});
    status(await request('/api/finance',{cookie:manager}),403);
    status(await request('/api/finance'),401);
    status(await request('/api/crm',{cookie:finance}),403);
    status(await request('/api/crm/customers',{cookie:finance}),403);
    status(await request('/api/admin',{cookie:finance}),403);
    status(await request('/api/export',{cookie:finance}),403);
    status(await request(fileUrl,{cookie:finance}),404);
    const state=await workspace(owner.cookie);
    const historic=state.data.projects.find(project=>project.name==='HTTP Ledger Contract');
    assert.ok(historic.ledger.receipts.some(receipt=>receipt.voided));
    // A ledger opened by the previous version did not carry a contract confirmation.
    await pool.query("UPDATE crm_projects SET payload=payload-'contract' WHERE workspace_id='smee:live' AND id=$1",[historic.id]);
    assert.ok(!(await ledger()).data.projects.some(project=>project.id===historic.id));

    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
    const privateScope='NOI_BO_HOP_DONG_HTTP';
    const privacyFixture={name:'Hợp đồng tài chính kiểm thử',customerId:customerA,serviceId:state.data.services[0].id,owner:'member-admin',budget:1000000,scope:privateScope,cost:123456};
    const created=status(await mutate(owner.cookie,{action:'create',collection:'projects',data:privacyFixture}),200);
    const id=created.data.projects.find(project=>project.name===privacyFixture.name).id;
    const confirm={action:'confirm_legacy_contract',id,data:{number:'HD-FIN-01',signedOn:today,budget:1000000,evidence:'Đối chiếu bản ký lưu tại công ty'}};
    status(await mutate(manager,confirm),403);
    status(await financeWrite(confirm),403);
    status(await financeWrite({action:'update',collection:'projects',id,data:{budget:1}}),403);
    status(await financeWrite({action:'record_project_receipt',id,data:{amount:1,date:today,reference:'NOT-LINKED'}}),404);
    status(await mutate(owner.cookie,{...confirm,data:{...confirm.data,signedOn:'2999-01-01'}}),400);
    const reconciled=status(await mutate(owner.cookie,{...confirm,id:historic.id,data:{...confirm.data,number:'HD-LICH-SU'}}),200);
    assert.deepEqual(reconciled.data.projects.find(project=>project.id===historic.id).ledger,historic.ledger);
    status(await mutate(owner.cookie,{...confirm,data:{...confirm.data,number:'hd-lich-su'}}),400);
    status(await mutate(owner.cookie,confirm),200);
    status(await mutate(owner.cookie,{action:'delete',collection:'projects',id}),400);
    const scoped=await ledger();
    const newProject=scoped.data.projects.find(project=>project.id===id);
    assert.equal(newProject.contract.number,'HD-FIN-01');
    assert.equal(newProject.cost,undefined);
    assert.ok(!JSON.stringify(scoped).includes(privateScope));
    assert.ok(!JSON.stringify(scoped).includes(confirm.data.evidence));
    assert.ok(scoped.data.customers.every(item=>Object.keys(item).sort().join(',')==='id,name'));

    const opening={action:'open_project_ledger',id,data:{openingAmount:120000,paymentDue:today}};
    status(await financeWrite(opening),403);
    status(await mutate(owner.cookie,opening),200);
    const revision=(await ledger()).revision;
    const first={action:'record_project_receipt',id,expectedRevision:revision,requestId:randomUUID(),data:{amount:500000,date:today,reference:'FIN-01'}};
    const second={...first,requestId:randomUUID(),data:{...first.data,reference:'FIN-02'}};
    const receipts=await Promise.all([financeWrite(first),financeWrite(second)]);
    assert.deepEqual(receipts.map(item=>item.status).sort(),[200,409]);
    const winner=receipts[0].status===200?first:second;
    status(await financeWrite(winner),200);
    let project=(await ledger()).data.projects.find(item=>item.id===id);
    assert.equal(project.ledger.receipts.length,2);
    status(await financeWrite({action:'record_project_receipt',id,data:{amount:1,date:today,reference:winner.data.reference.toLowerCase()}}),400);
    const old=project.ledger.receipts.find(receipt=>receipt.kind==='payment');
    const propose={action:'request_receipt_correction',id,data:{kind:'amount',receiptId:old.id,amount:700000,reason:'Theo sao kê đối chiếu'}};
    const requested=status(await financeWrite(propose),200).data.projects.find(item=>item.id===id).ledger.corrections[0];
    assert.deepEqual((await ledger()).data.projects.find(item=>item.id===id).ledger.receipts,project.ledger.receipts);
    const decide={action:'review_receipt_correction',id,data:{correctionId:requested.id,decision:'approved'}};
    status(await financeWrite(decide),403);
    status(await mutate(manager,decide),403);
    status(await mutate(owner.cookie,{action:'record_project_receipt',id,data:{amount:200000,date:today,reference:'FIN-EXTRA'}}),200);
    status(await mutate(owner.cookie,decide),400);
    status(await mutate(owner.cookie,{...decide,data:{...decide.data,decision:'returned',reason:'Đã nhận thêm một khoản, cần đối chiếu lại'}}),200);
    const correction=status(await financeWrite({...propose,data:{...propose.data,amount:400000}}),200).data.projects.find(item=>item.id===id).ledger.corrections[0];
    const approval={...decide,requestId:randomUUID(),data:{...decide.data,correctionId:correction.id}};
    status(await mutate(owner.cookie,approval),200);
    status(await mutate(owner.cookie,approval),200);
    project=(await ledger()).data.projects.find(item=>item.id===id);
    assert.equal(project.ledger.receipts.filter(receipt=>!receipt.voided).reduce((sum,receipt)=>sum+receipt.amount,0),720000);
    assert.equal(project.ledger.receipts.find(receipt=>receipt.id===old.id).voided.reason,propose.data.reason);
    assert.equal(project.ledger.receipts.filter(receipt=>receipt.reference===old.reference && !receipt.voided).length,1);
    const changed=status(await mutate(manager,{action:'request_legacy_contract_change',id,data:{budget:900000,scope:'Phạm vi trong phụ lục',reason:'Giảm hạng mục theo phụ lục'}}),200);
    const changeId=changed.data.projects.find(item=>item.id===id).legacyContractChanges[0].id;
    const amendment={action:'review_legacy_contract_change',id,data:{decision:'approved',changeId}};
    status(await mutate(manager,amendment),400);
    const adjusted=status(await mutate(owner.cookie,amendment),200).data.projects.find(item=>item.id===id);
    assert.equal(adjusted.contract.signedValue,1000000);
    assert.equal(adjusted.budget,900000);
    assert.deepEqual(adjusted.ledger,project.ledger);
    status(await lockAccount(owner.cookie,account.id),200);
    status(await request('/api/finance',{cookie:finance}),401);
  });
  await check('Account project progress, versioned publication approvals and acceptance preserve scope and unpaid balances',async()=>{
    const ownerCookie=owner.cookie;
    const sale=(await login('account-sales@example.test',employeePassword)).cookie;
    const manager=(await login('b-http@example.test',employeePassword)).cookie;
    const initial=await workspace(ownerCookie);
    const project=initial.data.projects.find(item=>item.contract?.number==='HD-HTTP-01');
    const projectPath=`/api/crm/customers/${project.customerId}/projects`;
    const settings={action:'update_settings',data:{contentApprovalRequired:true}};
    status(await request(projectPath),401);
    status(await request(projectPath,{cookie:teleA.cookie}),403);
    status(await request(`/api/crm/customers/${customerA}/projects`,{cookie:sale}),404);
    status(await mutate(manager,settings),403);
    status(await mutate(ownerCookie,settings),200);
    const progress=async()=>status(await request(projectPath,{cookie:sale}),200).projects.find(item=>item.id===project.id);
    let summary=await progress();
    assert.deepEqual(summary.open,{tasks:0,contents:0,issues:0});
    for(const key of ['budget','ledger','cost','contract','scope','acceptanceRecord']) assert.equal(Object.hasOwn(summary,key),false);
    const identity={projectId:project.id,owner:'member-admin'};
    const contentInput={...identity,title:'Bài đăng kiểm thử nghiệm thu',body:'Nội dung V1',status:'Sẵn sàng đăng'};
    status(await mutate(manager,{action:'create',collection:'contents',data:{...contentInput,status:'Đã đăng'}}),400);
    const content=status(await mutate(manager,{action:'create',collection:'contents',data:contentInput}),200).data.contents.find(item=>item.title===contentInput.title);
    const task=status(await mutate(manager,{action:'create',collection:'tasks',data:{...identity,name:'Việc kiểm thử nghiệm thu'}}),200).data.tasks.find(item=>item.name==='Việc kiểm thử nghiệm thu');
    const issue=status(await mutate(manager,{action:'create',collection:'issues',data:{...identity,title:'Vướng mắc nghiệm thu'}}),200).data.issues.find(item=>item.title==='Vướng mắc nghiệm thu');
    assert.deepEqual((await progress()).open,{tasks:1,contents:1,issues:1});
    const publish={action:'update',collection:'contents',id:content.id,data:{status:'Đã đăng'}};
    const approve={action:'review_content_publication',id:content.id,data:{decision:'approved',version:1,reason:'Khách xác nhận nội dung V1'}};
    status(await mutate(manager,publish),400);
    status(await mutate(sale,approve),403);
    status(await mutate(manager,{...approve,data:{...approve.data,decision:'returned',reason:'Bổ sung thông tin'}}),200);
    status(await mutate(manager,{action:'update',collection:'contents',id:content.id,data:{status:'Sẵn sàng đăng'}}),200);
    status(await mutate(manager,approve),200);
    const revised=status(await mutate(manager,{action:'update',collection:'contents',id:content.id,data:{channel:'Instagram',body:'Nội dung V2'}}),200).data.contents.find(item=>item.id===content.id);
    assert.equal(revised.approvedVersion,undefined);
    assert.equal(revised.history[0].confirmation,approve.data.reason);
    status(await mutate(manager,{action:'update',collection:'contents',id:content.id,data:{status:'Sẵn sàng đăng'}}),200);
    status(await mutate(manager,approve),400);
    status(await mutate(manager,publish),400);
    status(await mutate(manager,{...approve,data:{...approve.data,version:2,reason:'Khách xác nhận nội dung V2'}}),200);
    status(await mutate(manager,publish),200);

    const complete={action:'complete_project',id:project.id,data:{acceptance:'Biên bản bàn giao nội bộ'}};
    status(await mutate(manager,complete),400);
    status(await mutate(manager,{...complete,data:{...complete.data,exceptionReason:'Vướng mắc đã ghi trong biên bản'}}),403);
    status(await mutate(sale,complete),403);
    const exception={...complete,requestId:randomUUID(),data:{...complete.data,exceptionReason:'Khách đồng ý nhận trước phần đã hoàn thành'}};
    const after=status(await mutate(ownerCookie,exception),200).data.projects.find(item=>item.id===project.id);
    status(await mutate(ownerCookie,exception),200);
    assert.deepEqual(after.ledger,project.ledger);
    assert.equal(after.acceptanceRecord.evidence,complete.data.acceptance);
    assert.deepEqual(after.acceptanceRecord.exception.open,{tasks:1,contents:0,issues:1});
    summary=await progress();
    assert.equal(summary.status,'Hoàn tất');
    assert.equal(summary.acceptedAt,after.acceptanceRecord.actor.at);
    assert.ok(!JSON.stringify(summary).includes(exception.data.exceptionReason));
    status(await mutate(manager,{action:'update',collection:'tasks',id:task.id,data:{status:'Hoàn tất'}}),400);
    const reopened=status(await mutate(manager,{action:'reopen_project',id:project.id,data:{reason:'Bổ sung phần chưa bàn giao'}}),200);
    assert.equal(reopened.data.activities.filter(item=>item.entityId===project.id&&item.kind==='complete_project').length,1);
    assert.deepEqual(reopened.data.activities.find(item=>item.kind==='reopen_project').details.acceptanceRecord.before,after.acceptanceRecord);
    assert.equal((await progress()).acceptedAt,null);
    status(await mutate(manager,{action:'update',collection:'tasks',id:task.id,data:{status:'Hoàn tất'}}),200);
    status(await mutate(manager,{action:'resolve_issue',id:issue.id,data:{resolution:'Đã xử lý và thông báo khách'}}),200);
    const done=status(await mutate(manager,complete),200).data.projects.find(item=>item.id===project.id);
    assert.equal(done.acceptanceRecord.exception,undefined);
    assert.deepEqual(done.ledger,project.ledger);
    assert.deepEqual((await progress()).open,{tasks:0,contents:0,issues:0});
    status(await mutate(ownerCookie,{...settings,data:{contentApprovalRequired:false}}),200);
  });
  await check('delivery role reads only assigned project context, assigned work and linked content files', async()=>{
    async function addDelivery(suffix) {
      const email=`delivery-${suffix}@example.test`;
      const access=status(await changeAccount(owner.cookie,{action:'upsert',email,role:'delivery',newMember:{name:`Delivery ${suffix}`,jobTitle:'Production'}}),200);
      const account=access.accounts.find(item=>item.email===email);
      const beforeActivation=await request('/api/crm',{cookie:owner.cookie});
      assert.ok(!status(beforeActivation,200).projectAssignees.some(member=>member.id===account.teamMemberId));
      const invite=status(await request('/api/auth/invite',{method:'POST',cookie:owner.cookie,body:{accountId:account.id}}),200);
      const token=new URLSearchParams(new URL(invite.url).hash.slice(1)).get('token');
      status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),200);
      const activated=await request('/api/crm',{cookie:owner.cookie,headers:{'If-None-Match':beforeActivation.response.headers.get('etag')}});
      assert.ok(status(activated,200).projectAssignees.some(member=>member.id===account.teamMemberId));
      return {...account,...await login(email,employeePassword)};
    }
    const first=await addDelivery('a'),second=await addDelivery('b');
    async function addProject(name,customerId) {
      const state=await workspace(owner.cookie);
      const result=status(await mutate(owner.cookie,{action:'create',collection:'projects',data:{name,customerId,serviceId:state.data.services[0].id,owner:'member-admin',budget:910011,cost:120022,scope:'Operational brief'}}),200);
      assert.ok(result.projectAssignees.some(member=>member.id===first.teamMemberId));
      return result.data.projects.find(project=>project.name===name).id;
    }
    const p1=await addProject('Delivery visible',customerA),p2=await addProject('Delivery hidden',customerB);
    const forbiddenTask=await mutate(owner.cookie,{action:'create',collection:'tasks',data:{name:'Ineligible assignment',projectId:p1,owner:memberA}});
    status(forbiddenTask,400);
    async function addTask(projectId,recipient,name) {
      const saved=status(await mutate(owner.cookie,{action:'create',collection:'tasks',data:{name,projectId,owner:recipient,hourlyCost:456789,notes:'Work instructions'}}),200);
      return saved.data.tasks.find(task=>task.name===name).id;
    }
    const t1=await addTask(p1,first.teamMemberId,'Assigned work');
    const t2=await addTask(p2,second.teamMemberId,'Unassigned work');
    await addTask(p1,'member-admin','Other work in shared project');
    const contentFile=status(await upload(owner.cookie,png,'image/png','assigned-content.png'),201).url;
    const contentResult=status(await mutate(owner.cookie,{action:'create',collection:'contents',data:{title:'Assigned draft',projectId:p1,owner:first.teamMemberId,url:contentFile,body:'First draft'}}),200);
    const content=contentResult.data.contents.find(record=>record.title==='Assigned draft').id;
    const participants='/api/projects/'+p1+'/participants';
    const previous=status(await request(participants,{cookie:owner.cookie}),200);
    assert.equal(previous.candidates.length,2);
    status(await request(participants,{method:'POST',cookie:owner.cookie,body:{memberIds:[memberB],expectedRevision:previous.revision}}),400);
    status(await request(participants,{method:'POST',cookie:owner.cookie,body:{memberIds:[second.teamMemberId],expectedRevision:previous.revision-1}}),409);
    const group=status(await request(participants,{method:'POST',cookie:owner.cookie,body:{memberIds:[second.teamMemberId],expectedRevision:previous.revision}}),200);
    assert.deepEqual(group.members,[second.teamMemberId]);
    status(await request(participants,{cookie:first.cookie}),403);
    status(await request('/api/delivery',{cookie:owner.cookie}),403);
    status(await request('/api/crm',{cookie:first.cookie}),403);
    status(await request('/api/export',{cookie:first.cookie}),403);
    status(await request('/api/admin',{cookie:first.cookie}),403);
    const dashboard=async(user)=>status(await request('/api/delivery',{cookie:user.cookie}),200);
    const visible=await dashboard(first), shared=await dashboard(second);
    assert.deepEqual(visible.projects.map(project=>project.id),[p1]);
    assert.deepEqual(visible.tasks.map(task=>task.id),[t1]);
    assert.deepEqual(visible.contents.map(item=>item.id),[content]);
    assert.ok(!JSON.stringify(visible).includes('910011')&&!JSON.stringify(visible).includes('456789'));
    assert.ok(!('customerId' in visible.projects[0])&&!('ledger' in visible.projects[0]));
    assert.deepEqual(shared.projects.map(project=>project.id),[p1,p2]);
    assert.deepEqual(shared.tasks.map(task=>task.id),[t2]);
    assert.equal(shared.contents.length,0);
    status(await request(contentFile,{cookie:first.cookie}),200);
    status(await request(contentFile,{cookie:second.cookie}),404);
    if(fileUrl)status(await request(fileUrl,{cookie:first.cookie}),404);

    async function delivery(command,expected) {
      const state=await dashboard(first);
      return status(await request('/api/delivery',{method:'POST',cookie:first.cookie,body:{...command,expectedRevision:state.revision}}),expected);
    }
    await delivery({action:'update',collection:'tasks',id:t2,data:{status:'Hoàn tất'}},403);
    await delivery({action:'update',collection:'tasks',id:t1,data:{hourlyCost:0}},403);
    await delivery({action:'update',collection:'contents',id:content,data:{status:'Đã đăng'}},403);
    await delivery({action:'update',collection:'tasks',id:t1,data:{hours:3,status:'Hoàn tất',deliveryResult:'Work delivered'}},200);
    await delivery({action:'update',collection:'contents',id:content,data:{body:'Revised draft'}},200);
    await delivery({action:'update',collection:'contents',id:content,data:{status:'Sẵn sàng đăng'}},200);
    await delivery({action:'create',collection:'issues',data:{projectId:p2,title:'Hidden issue',description:'Not assigned'}},403);
    await delivery({action:'create',collection:'issues',data:{projectId:p1,title:'Delivery issue',description:'Needs customer asset',priority:'Cao'}},200);
    const issue=(await dashboard(first)).issues.find(item=>item.title==='Delivery issue');
    await delivery({action:'resolve_issue',id:issue.id,data:{resolution:'Asset received'}},200);
    const full=await workspace(owner.cookie);
    assert.equal(full.data.tasks.find(task=>task.id===t1).deliveryResult,'Work delivered');
    assert.equal(full.data.issues.find(item=>item.id===issue.id).owner,first.teamMemberId);

    const current=status(await request(participants,{cookie:owner.cookie}),200);
    status(await request(participants,{method:'POST',cookie:owner.cookie,body:{memberIds:[],expectedRevision:current.revision}}),200);
    assert.deepEqual((await dashboard(second)).projects.map(project=>project.id),[p2]);
    assert.deepEqual((await dashboard(first)).projects.map(project=>project.id),[p1]);
    status(await mutate(owner.cookie,{action:'update',collection:'contents',id:content,data:{status:'Đã đăng'}}),200);
    const other=full.data.tasks.find(task=>task.name==='Other work in shared project');
    status(await mutate(owner.cookie,{action:'update',collection:'tasks',id:other.id,data:{status:'Hoàn tất'}}),200);
    status(await mutate(owner.cookie,{action:'complete_project',id:p1,data:{acceptance:'Confirmed'}}),200);
    await delivery({action:'update',collection:'tasks',id:t1,data:{hours:4}},400);
    const receivingTask=await addTask(p2,first.teamMemberId,'Pending delivery offboarding');
    const nextParticipants='/api/projects/'+p2+'/participants';
    const p2State=status(await request(nextParticipants,{cookie:owner.cookie}),200);
    status(await request(nextParticipants,{method:'POST',cookie:owner.cookie,body:{memberIds:[first.teamMemberId],expectedRevision:p2State.revision}}),200);
    const preview=status(await request('/api/admin/offboarding?accountId='+first.id,{cookie:owner.cookie}),200);
    assert.equal(preview.work.delivery.count,2);
    const result=await request('/api/admin/offboarding',{method:'POST',cookie:owner.cookie,body:{accountId:first.id,action:'transfer',
      accessRevision:preview.accessRevision,workspaceRevision:preview.workspaceRevision,password:ownerPassword,reason:'Delivery handover',recipients:{delivery:second.teamMemberId}}});
    assert.equal(status(result,200).transferred,2);
    status(await request('/api/delivery',{cookie:first.cookie}),401);
    assert.ok((await dashboard(second)).tasks.some(task=>task.id===receivingTask));
    assert.deepEqual(status(await request(nextParticipants,{cookie:owner.cookie}),200).members,[second.teamMemberId]);
    assert.equal((await workspace(owner.cookie)).data.tasks.find(task=>task.id===t1).owner,first.teamMemberId);
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
  let mfaFinance;
  await check('offboarding validates role, previews work, revokes access and transfers only unfinished ownership',async()=>{
    await pool.query('DELETE FROM security_rate_limits');
    async function employee(suffix,role) {
      const email=`offboard-${suffix}@example.test`;
      const result=status(await changeAccount(owner.cookie,{action:'upsert',email,role,newMember:{name:'HTTP '+suffix,jobTitle:'QA'}}),200);
      const account=result.accounts.find(row=>row.email===email);
      const invite=async()=>status(await request('/api/auth/invite',{method:'POST',cookie:owner.cookie,body:{accountId:account.id}}),200);
      const token=new URLSearchParams(new URL((await invite()).url).hash.slice(1)).get('token');
      status(await request('/api/auth/activate',{method:'POST',body:{token,password:employeePassword}}),200);
      return {...account,...await login(email,employeePassword),invite};
    }
    const departing=await employee('departing','account'),replacement=await employee('replacement','account');
    mfaFinance=await employee('finance','finance');
    const id=status(await mutate(owner.cookie,{action:'create',collection:'customers',
      data:{name:'Offboarding customer',owner:departing.teamMemberId,phone:'0901239975'}}),200).data.customers.find(item=>item.name==='Offboarding customer').id;
    const dueDate=new Date().toISOString().slice(0,10);
    const action=title=>({action:'upsert_customer_action',id,data:{title,type:'Công việc',owner:departing.teamMemberId,dueDate}});
    const closed=status(await mutate(departing.cookie,action('Closed appointment')),200).data.customers.find(item=>item.id===id).actions[0];
    status(await mutate(departing.cookie,{action:'complete_customer_action',id,data:{actionId:closed.id,result:'Done'}}),200);
    status(await mutate(departing.cookie,action('Pending callback')),200);
    const before=await workspace(owner.cookie);
    const dealInput={customerId:id,serviceId:before.data.services[0].id};
    status(await mutate(departing.cookie,{action:'create',collection:'deals',data:{...dealInput,name:'Open handover deal'}}),200);
    const saved=status(await mutate(departing.cookie,{action:'create',collection:'deals',data:{...dealInput,name:'Lost handover deal'}}),200);
    const lost=saved.data.deals.find(item=>item.name==='Lost handover deal');
    status(await mutate(owner.cookie,{action:'update',collection:'deals',id:lost.id,data:{stage:'Không thành công',lossReason:'Lost before departure'}}),200);
    const lateInvite=await departing.invite();
    const endpoint='/api/admin/offboarding';
    const previewPath=endpoint+'?accountId='+departing.id;
    status(await request(previewPath,{cookie:replacement.cookie}),403);
    const preview=async()=>status(await request(previewPath,{cookie:owner.cookie}),200);
    const initial=await preview();
    assert.equal(initial.work.sales.count,3);
    assert.ok(initial.choices.sales.some(item=>item.id===replacement.teamMemberId));
    assert.ok(!initial.choices.sales.some(item=>item.id===mfaFinance.teamMemberId));
    const send=(properties,cookie=owner.cookie)=>request(endpoint,{method:'POST',cookie,body:{
      accountId:departing.id,action:'transfer',reason:'Employee left',password:ownerPassword,
      accessRevision:initial.accessRevision,workspaceRevision:initial.workspaceRevision,recipients:{sales:replacement.teamMemberId},...properties}});
    status(await send({},replacement.cookie),403);
    status(await send({password:'wrong-password'}),400);
    status(await send({recipients:{sales:mfaFinance.teamMemberId}}),400);
    status(await send({workspaceRevision:initial.workspaceRevision-1}),409);
    assert.equal((await preview()).work.sales.count,3);
    assert.equal((await preview()).active,true);
    assert.equal(status(await send({action:'lock'}),200).transferred,0);
    status(await request('/api/crm',{cookie:departing.cookie}),401);
    const lateToken=new URLSearchParams(new URL(lateInvite.url).hash.slice(1)).get('token');
    status(await request('/api/auth/activate',{method:'POST',body:{token:lateToken,password:employeePassword}}),400);
    const afterLock=await preview();
    assert.equal(afterLock.active,false);
    assert.equal(afterLock.work.sales.count,3);
    assert.equal(status(await send({accessRevision:afterLock.accessRevision}),200).transferred,3);
    const after=await workspace(replacement.cookie);
    const customer=after.data.customers.find(item=>item.id===id);
    assert.equal(customer.owner,replacement.teamMemberId);
    assert.equal(customer.actions.find(item=>item.title==='Pending callback').owner,replacement.teamMemberId);
    assert.equal(customer.actions.find(item=>item.id===closed.id).owner,departing.teamMemberId);
    assert.equal(after.data.deals.find(item=>item.name==='Open handover deal').owner,replacement.teamMemberId);
    assert.equal(after.data.deals.find(item=>item.id===lost.id).owner,departing.teamMemberId);
    const admin=status(await request('/api/admin',{cookie:owner.cookie}),200);
    assert.ok(admin.events.some(event=>event.action==='offboarding'&&event.subject===departing.email&&event.reason==='Employee left'));
    assert.equal((await preview()).work.sales.count,0);
  });
  await check('credential throttle blocks repeated failed logins',async()=>{
    await pool.query('DELETE FROM security_rate_limits');
    for(let i=0;i<10;i++)status(await request('/api/auth/login',{method:'POST',body:{email:'unknown-rate@example.test',password:'wrong-but-long-password'}}),401);
    const limited=await request('/api/auth/login',{method:'POST',body:{email:'unknown-rate@example.test',password:'wrong-but-long-password'}});status(limited,429);assert.equal(limited.response.headers.get('retry-after'),'60');
  });
  // Verify HTTPS cookie naming/flags through the actual compiled production route.
  await check('HTTPS configuration produces Secure __Host- session cookies',async()=>{
    await pool.query('DELETE FROM security_rate_limits');
    await startApp({...env,APP_ORIGIN:'https://crm.example.test'});
    const signed=await login(ownerEmail,ownerPassword,{Origin:'https://crm.example.test'});
    assert.match(signed.cookie,/^__Host-smee-session=/);assert.match(signed.setCookie,/;\s*Secure/i);assert.match(signed.setCookie,/HttpOnly/i);assert.match(signed.setCookie,/SameSite=Lax/i);
  });
  await check('mandatory MFA restricts existing owner and finance sessions until verified enrollment',async()=>{
    await pool.query('DELETE FROM security_rate_limits');
    await startApp({...env,SMEE_REQUIRE_MFA:'true'});
    status(await request('/api/admin',{cookie:owner.cookie}),401);
    status(await request('/api/finance',{cookie:mfaFinance.cookie}),401);
    const signIn=(email,password,code)=>request('/api/auth/login',{method:'POST',body:{email,password,code}});
    const session=result=>result.response.headers.get('set-cookie').split(';',1)[0];
    const mfa=(cookie,body)=>request('/api/auth/mfa',{method:'POST',cookie,body});
    async function enroll(email,password,target) {
      const signed=await signIn(email,password);
      assert.equal(status(signed,200).returnTo,'/account/mfa');
      assert.match(signed.response.headers.get('set-cookie'),/Max-Age=600/i);
      const setup=session(signed);
      status(await request(target,{cookie:setup}),401);
      assert.ok(status(await request('/account/mfa',{cookie:setup}),200).includes('Xác thực hai lớp'));
      status(await mfa(setup,{action:'begin',password:'incorrect-password'}),400);
      const {secret}=status(await mfa(setup,{action:'begin',password}),200);
      assert.match(secret,/^[A-Z2-7]{32}$/);
      const issuedAt=Date.now();
      const code=codeForSetup(secret,issuedAt);
      const separate=await signIn(email,password);
      status(await mfa(session(separate),{action:'confirm',code}),400);
      const result=await mfa(setup,{action:'confirm',code});
      const {codes}=status(result,200);
      assert.equal(codes.length,8);
      assert.equal(new Set(codes).size,8);
      const cookie=session(result);
      status(await request(target,{cookie:setup}),401);
      status(await request(target,{cookie}),200);
      status(await signIn(email,password,code),401);
      const prompt=await signIn(email,password);
      assert.equal(status(prompt,409).mfaRequired,true);
      assert.equal(prompt.response.headers.get('set-cookie'),null);
      const nextCode=codeForSetup(secret,issuedAt+30_000);
      const totpLogin=await signIn(email,password,nextCode);
      status(totpLogin,200);
      status(await request(target,{cookie:session(totpLogin)}),200);
      status(await signIn(email,password,nextCode),401);
      const recoveries=await Promise.all([signIn(email,password,codes[0]),signIn(email,password,codes[0])]);
      assert.deepEqual(recoveries.map(item=>item.status).sort(),[200,401]);
      return {cookie,codes};
    }
    const securedOwner=await enroll(ownerEmail,ownerPassword,'/api/admin');
    const securedFinance=await enroll(mfaFinance.email,employeePassword,'/api/finance');
    const admin=status(await request('/api/admin',{cookie:securedOwner.cookie}),200);
    assert.ok(admin.mfa.ownerEnabled&&admin.mfa.required&&admin.mfa.enabledAccountIds.includes(mfaFinance.id));
    const reset=(cookie,password)=>request('/api/admin/mfa-reset',{method:'POST',cookie,body:{accountId:mfaFinance.id,password}});
    status(await reset(securedFinance.cookie,employeePassword),403);
    status(await reset(securedOwner.cookie,'wrong-password'),400);
    status(await reset(securedOwner.cookie,ownerPassword),200);
    status(await request('/api/finance',{cookie:securedFinance.cookie}),401);
    const mustSetUp=await signIn(mfaFinance.email,employeePassword,securedFinance.codes[1]);
    assert.equal(status(mustSetUp,200).returnTo,'/account/mfa');
    status(await request('/api/finance',{cookie:session(mustSetUp)}),401);
    await child(process.execPath,['--import','tsx','scripts/reset-owner-mfa.ts','--confirm-reset-mfa'],env);
    status(await request('/api/admin',{cookie:securedOwner.cookie}),401);
    await startApp(env);
    assert.equal(status(await signIn(ownerEmail,ownerPassword,securedOwner.codes[1]),200).returnTo,'/account/mfa');
  });
  console.log(`PASS ${checks}/${checks} HTTP scenarios against PostgreSQL. Scanner protocol mocked; real ClamAV engine and public TLS/DNS are not covered.`);
}catch(error){console.error('HTTP integration failed:',error instanceof Error?error.message:error);console.error('App log tail:',appLogs.slice(-5000));process.exitCode=1;}
finally{
  if(app && app.exitCode===null){app.kill('SIGTERM');await Promise.race([new Promise(resolve=>app.once('exit',resolve)),sleep(3000)]);if(app.exitCode===null)app.kill('SIGKILL');}
  for(const socket of sockets)socket.destroy();
  if(scanner.listening)await new Promise(resolve=>scanner.close(resolve));
  await pool.end();await rm(uploadDir,{recursive:true,force:true});
}
