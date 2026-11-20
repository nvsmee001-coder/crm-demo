import { getCurrentUser } from '@/lib/auth/session';
import { authFailure } from '@/lib/auth/response';
import { AuthError } from '@/lib/auth/store';
import { listCustomers } from '@/lib/customer-directory';
import { readCustomerDirectory, readCustomerProfile, readCustomerSelection } from '@/lib/customer-screen';
import { CRMError } from '@/lib/crm-engine';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function GET(request: Request) {
  try {
    const user=await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('customers:list:'+user.userId,120,60);
    const params=new URL(request.url).searchParams;
    const mode=params.get('mode');
    if (mode!==null&&mode!=='live') throw new CRMError('Danh sách này chỉ phục vụ dữ liệu công ty.',403);
    const view=params.get('view');
    if (view==='directory') return Response.json(await readCustomerDirectory(user,params),{headers});
    if (view==='profile') return Response.json(await readCustomerProfile(user,params.get('id') ?? ''),{headers});
    if (view!==null) throw new CRMError('Góc nhìn khách hàng không hợp lệ.');
    return Response.json(await listCustomers(user,params),{headers});
  } catch (error) {
    if (error instanceof CRMError&&error.status===404) return Response.json({error:error.message},{headers,status:404});
    return authFailure(error);
  }
}

export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const user=await getCurrentUser();
    if (!user) throw new AuthError('Vui lòng đăng nhập.',401);
    await rateLimit('customers:selection:'+user.userId,30,60);
    const {action,filters='',ids,revision}=await readJsonBody(request,100_000);
    if (typeof filters!=='string'||filters.length>8000) throw new CRMError('Bộ lọc danh sách không hợp lệ.');
    return Response.json(await readCustomerSelection(user,action,new URLSearchParams(filters),ids,revision),{headers});
  } catch (error) {
    return authFailure(error);
  }
}
