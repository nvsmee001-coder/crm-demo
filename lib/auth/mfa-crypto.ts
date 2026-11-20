import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AccessRole } from '../crm-types';
import { AuthError } from './error';

const base32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const stepMs=30_000;
const purpose=(userId:string)=>Buffer.from(`smee:totp:v1:${userId}`,'utf8');

export function mfaRequired(role:AccessRole) {
  return process.env.SMEE_REQUIRE_MFA==='true' && (role==='owner'||role==='finance');
}

export function mfaAvailable() {
  return /^[a-f0-9]{64}$/i.test(process.env.SMEE_MFA_KEY ?? '');
}

function key() {
  if (!mfaAvailable()) throw new AuthError('Khóa xác thực của máy chủ chưa sẵn sàng. Liên hệ quản trị.',503);
  return Buffer.from(process.env.SMEE_MFA_KEY!,'hex');
}

export function newMfaSecret() { return randomBytes(20); }

export function formatMfaSecret(secret:Buffer) {
  let bits=0, value=0, result='';
  for (const byte of secret) {
    value=(value<<8)|byte;
    bits+=8;
    while(bits>=5) { bits-=5;result+=base32[(value>>bits)&31]; }
  }
  if (bits) result+=base32[(value<<(5-bits))&31];
  return result;
}

export function protectMfaSecret(secret:Buffer,userId:string) {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(purpose(userId));
  return Buffer.concat([iv,cipher.update(secret),cipher.final(),cipher.getAuthTag()]).toString('base64url');
}

export function readMfaSecret(encrypted:string,userId:string) {
  const material=key();
  try {
    const bytes=Buffer.from(encrypted,'base64url');
    if (bytes.length!==48) throw Error('Invalid factor');
    const decipher=createDecipheriv('aes-256-gcm',material,bytes.subarray(0,12));
    decipher.setAAD(purpose(userId));
    decipher.setAuthTag(bytes.subarray(32));
    return Buffer.concat([decipher.update(bytes.subarray(12,32)),decipher.final()]);
  } catch { throw new AuthError('Không đọc được khóa xác thực. Liên hệ quản trị.',503); }
}

export function totpAtStep(secret:Buffer,step:number) {
  const message=Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(step));
  const digest=createHmac('sha1',secret).update(message).digest();
  const offset=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');
}

export function matchedTotpStep(secret:Buffer,code:unknown,lastStep:number,now=Date.now()) {
  if (typeof code!=='string' || !/^\d{6}$/.test(code.trim())) return undefined;
  const entered=Buffer.from(code.trim());
  const current=Math.floor(now/stepMs);
  for (const step of [current,current-1,current+1]) {
    if (step>=0 && step>lastStep && timingSafeEqual(entered,Buffer.from(totpAtStep(secret,step)))) return step;
  }
}

export function newRecoveryCode() {
  return randomBytes(10).toString('hex').toUpperCase().match(/.{5}/g)!.join('-');
}

export function recoveryMaterial(value:unknown) {
  if (typeof value!=='string' || value.length>40) return;
  const raw=value.replace(/[\s-]/g,'').toLowerCase();
  if (/^[0-9a-f]{20}$/.test(raw)) return 'smee:mfa-recovery:'+raw;
}
