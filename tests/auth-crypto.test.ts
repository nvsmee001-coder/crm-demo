import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,passwordProblem,newToken,isToken,tokenHash,safeReturnTo,normalizeEmail,validEmail} from '../lib/auth/crypto';
test('password hashes use independent salts, verify passwords and reject tampered parameters',async()=>{
 const password='fixture-only strong password 2026';const a=await hashPassword(password),b=await hashPassword(password);
 assert.notEqual(a,b);assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('wrong password',a),false);assert.equal(await verifyPassword(password,a.replace('$65536$','$1073741824$')),false);assert.equal(await verifyPassword(password,'broken'),false);
});
test('password bounds are applied before expensive hashing',async()=>{
 assert.ok(passwordProblem('short'));assert.ok(passwordProblem(' '.repeat(20)));assert.ok(passwordProblem('a'.repeat(129)));assert.equal(passwordProblem('a valid long phrase'),null);await assert.rejects(hashPassword('short'));
});
test('session/setup tokens are random, well formed and stored using one-way digests',()=>{
 const a=newToken(),b=newToken();assert.ok(isToken(a));assert.notEqual(a,b);assert.equal(isToken('x'.repeat(64)),false);assert.equal(tokenHash(a).length,64);assert.notEqual(tokenHash(a),a);
});
test('return destinations stay within the application',()=>{
 for(const unsafe of ['https://evil.test','//evil.test','/\\evil.test','/login?returnTo=//evil.test','/activate#token=x','/api/auth/logout','/\nfoo'])assert.equal(safeReturnTo(unsafe),'/',unsafe);
 assert.equal(safeReturnTo('/account/password'),'/account/password');assert.equal(safeReturnTo('/?view=customers'), '/?view=customers');
});
test('email normalization is stable and bounded',()=>{assert.equal(normalizeEmail('  STAFF@EXAMPLE.TEST '),'staff@example.test');assert.ok(validEmail('staff@example.test'));assert.equal(validEmail('not-an-email'),false);assert.equal(validEmail('x'.repeat(250)+'@x.test'),false)});
