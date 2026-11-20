import { NextResponse } from 'next/server';
import { assertSameOrigin, clientAddress, rateLimit, readJsonBody } from '@/lib/http-security';
import { loginPassword } from '@/lib/auth/store';
import { normalizeEmail, safeReturnTo, tokenHash } from '@/lib/auth/crypto';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { authFailure } from '@/lib/auth/response';
import { MfaRequiredError } from '@/lib/auth/error';
export const runtime='nodejs';
export async function POST(request:Request){try{
  assertSameOrigin(request);
  await rateLimit('login:ip:'+clientAddress(request),30,900);
  const body=await readJsonBody(request,4096);
  await rateLimit('login:email:'+tokenHash(normalizeEmail(body.email).slice(0,254)),10,900);
  const {token,setupRequired}=await loginPassword(body.email,body.password,body.code);
  const response=NextResponse.json({ok:true,returnTo:setupRequired?'/account/mfa':safeReturnTo(body.returnTo)},{headers:{'Cache-Control':'no-store'}});
  const options=sessionCookieOptions();
  response.cookies.set(SESSION_COOKIE,token,setupRequired?{...options,maxAge:600}:options);
  return response;
}catch(error){
  if (error instanceof MfaRequiredError) return NextResponse.json({mfaRequired:true,error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  return authFailure(error)
}}
