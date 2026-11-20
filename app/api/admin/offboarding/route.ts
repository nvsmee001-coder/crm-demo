import { getCurrentUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/auth/error';
import { authFailure } from '@/lib/auth/response';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';
import { offboard, previewOffboarding } from '@/lib/offboarding';

const headers={'Cache-Control':'private, no-store'};

export async function GET(request:Request) {
  try {
    const user=await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('offboarding:read:'+user.userId,30,60);
    const accountId=new URL(request.url).searchParams.get('accountId');
    return Response.json(await previewOffboarding(user,accountId),{headers});
  } catch (error) { return authFailure(error); }
}

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const user=await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('offboarding:write:'+user.userId,12,900);
    return Response.json(await offboard(user,await readJsonBody(request,4096)),{headers});
  } catch (error) { return authFailure(error); }
}
