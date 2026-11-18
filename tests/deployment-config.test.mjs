import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploymentEnvironment } from '../scripts/check-config.mjs';
const valid = {
 NODE_ENV:'production',APP_ORIGIN:'https://crm.smee.test',SMEE_OWNER_EMAIL:'owner@smee.test',UPLOAD_DIR:'/app/data/uploads',
 DATABASE_URL:'postgresql://smee:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef@postgres:5432/smee',
 CLAMAV_REQUIRED:'true',CLAMAV_HOST:'clamav',CLAMAV_PORT:'3310',TRUST_PROXY:'true',
};
test('production configuration accepts independent secure services',()=>assert.equal(validateDeploymentEnvironment(valid),true));
test('shipped placeholders and insecure production origin are rejected',()=>{
 for(const override of [
  {APP_ORIGIN:'https://crm.example.com'}, {APP_ORIGIN:'http://crm.smee.test'}, {APP_ORIGIN:'https://crm.smee.test/'},
  {SMEE_OWNER_EMAIL:'owner@example.com'}, {UPLOAD_DIR:'public/uploads'}, {CLAMAV_REQUIRED:'false'}, {CLAMAV_HOST:''},
  {DATABASE_URL:'postgresql://smee:REPLACE_WITH_64_HEX_CHARACTERS@postgres:5432/smee'},
  {DATABASE_URL:'postgresql://smee:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@postgres:5432/smee'},
 ]) assert.throws(()=>validateDeploymentEnvironment({...valid,...override}));
});
test('validation errors never include the rejected database secret',()=>{
 const secret='private-short-value';
 try {validateDeploymentEnvironment({...valid,DATABASE_URL:`postgresql://smee:${secret}@postgres:5432/smee`});assert.fail('must reject');}
 catch(error){assert.ok(!error.message.includes(secret));}
});
