import test from 'node:test';
import assert from 'node:assert/strict';
import { appOrigin, assertSameOrigin, readBodyLimited, readJsonBody, clientAddress, HttpError } from '../lib/http-security';

test('canonical origin rejects forged Host, missing/cross-site Origin and non-HTTPS public origins', () => {
  process.env.APP_ORIGIN='https://crm.example.test';
  assertSameOrigin(new Request('http://internal:3000/api/crm',{headers:{origin:'https://crm.example.test'}}));
  for (const headers of [{},{origin:'https://attacker.test'},{origin:'null'},{origin:'https://crm.example.test','sec-fetch-site':'cross-site'}] as Record<string,string>[]) {
    assert.throws(()=>assertSameOrigin(new Request('http://internal:3000/api/crm',{headers})),(e:unknown)=>e instanceof HttpError && e.status===403);
  }
  process.env.APP_ORIGIN='http://crm.example.test';assert.throws(appOrigin);
  process.env.APP_ORIGIN='https://crm.example.test/path';assert.throws(appOrigin);
  process.env.APP_ORIGIN='http://127.0.0.1:3000';assert.equal(appOrigin(),'http://127.0.0.1:3000');
});

test('body size enforced on chunked requests without Content-Length and streams are cancelled', async () => {
  let cancelled=false;
  const body=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array(50));},cancel(){cancelled=true;}});
  const request=new Request('https://crm.example.test/api/crm',{method:'POST',body,duplex:'half'} as RequestInit);
  await assert.rejects(readBodyLimited(request,80),(e:unknown)=>e instanceof HttpError && e.status===413);
  assert.equal(cancelled,true);
  await assert.rejects(readBodyLimited(new Request('https://crm.example.test',{method:'POST',headers:{'Content-Length':'999'},body:'a'}),80));
});

test('JSON input must be object, valid UTF8, correct content type and within bound', async () => {
  const req=(body:string,type='application/json')=>new Request('https://crm.example.test',{method:'POST',headers:{'Content-Type':type},body});
  assert.deepEqual(await readJsonBody(req('{"hello":"world"}'),50),{hello:'world'});
  for(const bad of ['[]','null','true','{bad'])await assert.rejects(readJsonBody(req(bad)));
  await assert.rejects(readJsonBody(req('{}','text/plain')));
});

test('client address ignores caller headers unless the operator explicitly trusts the private proxy', () => {
  delete process.env.TRUST_PROXY;
  const request=new Request('https://crm.example.test',{headers:{'x-real-ip':'192.0.2.20','x-forwarded-for':'198.51.100.1'}});
  assert.equal(clientAddress(request),'direct');
  process.env.TRUST_PROXY='true';assert.equal(clientAddress(request),'192.0.2.20');
  assert.equal(clientAddress(new Request('https://crm.example.test',{headers:{'x-real-ip':'a,b'}})),'unknown');
  delete process.env.TRUST_PROXY;
});
