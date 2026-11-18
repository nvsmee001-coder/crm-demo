import { NextResponse } from 'next/server';
import { assertSameOrigin, clientAddress, rateLimit, readJsonBody } from '@/lib/http-security';
import { loginPassword } from '@/lib/auth/store';
import { normalizeEmail, safeReturnTo, tokenHash } from '@/lib/auth/crypto';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { authFailure } from '@/lib/auth/response';
export const runtime='nodejs';
export async function POST(request:Request){try{
  assertSameOrigin(request);
  await rateLimit('login:ip:'+clientAddress(request),30,900);
  const body=await readJsonBody(request,4096);
  await rateLimit('login:email:'+tokenHash(normalizeEmail(body.email).slice(0,254)),10,900);
  const {token}=await loginPassword(body.email,body.password);
  const response=NextResponse.json({ok:true,returnTo:safeReturnTo(body.returnTo)},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(SESSION_COOKIE,token,sessionCookieOptions());
  return response;
}catch(error){return authFailure(error)}}
