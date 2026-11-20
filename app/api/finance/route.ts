import { getCurrentUser } from '@/lib/auth/session';
import { authFailure } from '@/lib/auth/response';
import { AuthError } from '@/lib/auth/store';
import { mutateFinanceWorkspace } from '@/lib/crm-store';
import { CRMError } from '@/lib/crm-error';
import type { Command } from '@/lib/crm-types';
import { readFinanceDashboard } from '@/lib/finance-store';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('finance:read:'+user.userId,120,60);
    return Response.json(await readFinanceDashboard(user),{headers});
  } catch(error) { return authFailure(error); }
}

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('finance:write:'+user.userId,60,60);
    return Response.json(await mutateFinanceWorkspace(user,await readJsonBody(request,16_000) as Command),{headers});
  } catch(error) {
    if (error instanceof CRMError && error.status===404) return Response.json({error:error.message},{headers,status:404});
    return authFailure(error);
  }
}
