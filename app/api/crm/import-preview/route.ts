import { getCurrentUser } from '@/lib/auth/session';
import { authFailure } from '@/lib/auth/response';
import { CRMError } from '@/lib/crm-engine';
import { previewStaffExcel } from '@/lib/crm-store';
import { previewDirectoryImport } from '@/lib/customer-screen';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';

export const dynamic='force-dynamic';
export async function POST(request:Request) {
  try {
    const user=await getCurrentUser();
    if(!user)throw new CRMError('Vui lòng đăng nhập để xem trước dữ liệu Excel.',401);
    assertSameOrigin(request);
    await rateLimit('crm:prospect-preview:'+user.userId,20,60);
    const body=await readJsonBody(request,1_000_000);
    if(Object.keys(body).some(key=>key!=='rows'&&key!=='owner'))throw new CRMError('Dữ liệu xem trước không hợp lệ.');
    const preview=Object.hasOwn(body,'owner') ? await previewDirectoryImport(user,body.rows,body.owner) : await previewStaffExcel(user,body.rows);
    return Response.json(preview,{
      headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'},
    });
  } catch(error) {
    return authFailure(error);
  }
}
