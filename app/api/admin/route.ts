import { getAdminDashboard } from '@/lib/access-store';
import { getCurrentUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/auth/store';
import { authFailure } from '@/lib/auth/response';
import { rateLimit } from '@/lib/http-security';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.', 401);
    await rateLimit('admin:read:' + user.userId, 90, 60);
    return Response.json(await getAdminDashboard(user), {
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    return authFailure(error);
  }
}
