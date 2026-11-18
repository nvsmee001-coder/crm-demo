import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { assertSameOrigin } from '@/lib/http-security';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { logoutToken } from '@/lib/auth/store';
import { authFailure } from '@/lib/auth/response';
export const runtime='nodejs';
export async function POST(request:Request){try{
  assertSameOrigin(request);
  await logoutToken((await cookies()).get(SESSION_COOKIE)?.value);
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(SESSION_COOKIE,'',{...sessionCookieOptions(),maxAge:0});return response;
}catch(error){return authFailure(error)}}
