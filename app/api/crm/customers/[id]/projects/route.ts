import { readAccountProjects } from '@/lib/account-projects';
import { authFailure } from '@/lib/auth/response';
import { getCurrentUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/auth/store';
import { CRMError } from '@/lib/crm-error';
import { rateLimit } from '@/lib/http-security';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const user=await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('account:projects:'+user.userId,120,60);
    return Response.json(await readAccountProjects(user,(await params).id),{headers});
  } catch(error) {
    if (error instanceof CRMError && error.status===404) return Response.json({error:error.message},{headers,status:404});
    return authFailure(error);
  }
}
