import { getReadAccess } from '@/lib/access-store';
import { getCurrentUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/auth/error';
import { resetStaffMfa } from '@/lib/auth/mfa-store';
import { authFailure } from '@/lib/auth/response';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const user=await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.',401);
    if ((await getReadAccess(user)).role!=='owner') throw new AuthError('Chức năng này chỉ dành cho chủ sở hữu.',403);
    await rateLimit('mfa:staff-reset:'+user.userId,10,900);
    const body=await readJsonBody(request,4096);
    await resetStaffMfa(user,body.accountId,body.password);
    return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) { return authFailure(error); }
}
