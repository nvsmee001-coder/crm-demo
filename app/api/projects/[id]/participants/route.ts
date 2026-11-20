import { getCurrentUser } from '@/lib/auth/session';
import { AuthError } from '@/lib/auth/store';
import { authFailure } from '@/lib/auth/response';
import { CRMError } from '@/lib/crm-engine';
import { readProjectAssignment, updateProjectAssignment } from '@/lib/delivery-store';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
type Context={params:Promise<{id:string}>};
function failure(error:unknown) {
  if (error instanceof CRMError&&error.status===404) return Response.json({error:error.message},{headers,status:404});
  return authFailure(error);
}

export async function GET(_request:Request,context:Context) {
  try {
    const user=await getCurrentUser();
    if(!user)throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('project-members:read:'+user.userId,90,60);
    return Response.json(await readProjectAssignment(user,(await context.params).id),{headers});
  } catch(error) {return failure(error);}
}

export async function POST(request:Request,context:Context) {
  try {
    assertSameOrigin(request);
    const user=await getCurrentUser();
    if(!user)throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('project-members:write:'+user.userId,30,60);
    const {memberIds,expectedRevision}=await readJsonBody(request,20_000);
    return Response.json(await updateProjectAssignment(user,(await context.params).id,memberIds,expectedRevision),{headers});
  } catch (error) {return failure(error);}
}
