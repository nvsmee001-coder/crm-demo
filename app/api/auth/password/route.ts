import { NextResponse } from 'next/server';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';
import { getCurrentUser, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { AuthError, changePassword } from '@/lib/auth/store';
import { authFailure } from '@/lib/auth/response';
export const runtime='nodejs';
export async function POST(request:Request){try{
  assertSameOrigin(request);const user=await getCurrentUser();if(!user)throw new AuthError('Vui lòng đăng nhập.',401);
  await rateLimit('password:user:'+user.userId,5,3600);const body=await readJsonBody(request,4096);
  await changePassword(user.userId,body.currentPassword,body.newPassword);
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(SESSION_COOKIE,'',{...sessionCookieOptions(),maxAge:0});return response;
}catch(error){return authFailure(error)}}
