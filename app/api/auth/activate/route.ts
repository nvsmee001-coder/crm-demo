import { NextResponse } from 'next/server';
import { assertSameOrigin, clientAddress, rateLimit, readJsonBody } from '@/lib/http-security';
import { activatePassword } from '@/lib/auth/store';
import { isToken, tokenHash } from '@/lib/auth/crypto';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { authFailure } from '@/lib/auth/response';
export const runtime='nodejs';
export async function POST(request:Request){try{
  assertSameOrigin(request);await rateLimit('activate:ip:'+clientAddress(request),15,900);
  const body=await readJsonBody(request,4096);
  if(isToken(body.token))await rateLimit('activate:token:'+tokenHash(body.token),5,900);
  await activatePassword(body.token,body.password);
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(SESSION_COOKIE,'',{...sessionCookieOptions(),maxAge:0});return response;
}catch(error){return authFailure(error)}}
