import { NextResponse } from 'next/server';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';
import { getMfaSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { beginMfaEnrollment, finishMfaEnrollment } from '@/lib/auth/mfa-store';
import { authFailure } from '@/lib/auth/response';
import { AuthError } from '@/lib/auth/error';

export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const session=await getMfaSession();
    if (!session) throw new AuthError('Vui lòng đăng nhập lại.',401);
    await rateLimit('mfa:enrollment:'+session.user.userId,12,900);
    const body=await readJsonBody(request,4096);
    if (body.action==='begin') {
      return NextResponse.json(await beginMfaEnrollment(session.user,session.token,body.password),{headers});
    }
    if (body.action!=='confirm') throw new AuthError('Chọn thao tác MFA hợp lệ.');
    const {token,codes}=await finishMfaEnrollment(session.user,session.token,body.code);
    const response=NextResponse.json({codes},{headers});
    response.cookies.set(SESSION_COOKIE,token,sessionCookieOptions());
    return response;
  } catch (error) { return authFailure(error); }
}
