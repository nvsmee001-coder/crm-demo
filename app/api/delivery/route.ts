import { getCurrentUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/auth/store';
import { authFailure } from '@/lib/auth/response';
import type { Command } from '@/lib/crm-types';
import { mutateDeliveryWorkspace } from '@/lib/crm-store';
import { readDeliveryDashboard } from '@/lib/delivery-store';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function GET() {
  try {
    const user=await getCurrentUser();
    if(!user)throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('delivery:read:'+user.userId,120,60);
    return Response.json(await readDeliveryDashboard(user),{headers});
  } catch(error) {return authFailure(error);}
}

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const user=await getCurrentUser();
    if(!user)throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('delivery:write:'+user.userId,60,60);
    return Response.json(await mutateDeliveryWorkspace(user,await readJsonBody(request,150_000) as Command),{headers});
  } catch (error) {return authFailure(error);}
}
