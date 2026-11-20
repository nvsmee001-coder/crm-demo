import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAccess } from '@/lib/access-store';
import { loadWorkspace } from '@/lib/crm-store';
import { fileMetadata, readFileBytes } from '@/lib/file-store';
import { rateLimit } from '@/lib/http-security';
import { deliveryCanReadContentFile } from '@/lib/delivery-store';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, context: {params: Promise<{path:string[]}>}) {
  const user = await getChatGPTUser();
  if (!user) return new Response('Vui lòng đăng nhập.', {status:401});
  try {
    const access = await getAccess(user);
    await rateLimit('download:' + user.userId, 180, 60);
    const {path} = await context.params, id = path?.[0];
    if (!id || path.length > 2) return new Response('Không tìm thấy tệp.', {status:404});
    const file = await fileMetadata(id);
    if (!file || file.owner_id !== access.ownerId) return new Response('Không tìm thấy tệp.', {status:404});
    if (access.role==='delivery') {
      const origin=process.env.APP_ORIGIN || new URL(request.url).origin;
      if (!await deliveryCanReadContentFile(user,id,origin)) return new Response('Không tìm thấy tệp.',{status:404});
    } else if (access.role !== 'owner' && access.role !== 'manager') {
      const {data} = await loadWorkspace('live', user);
      const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
      const linked = data.customers.some(customer => {
        if (!customer.avatarUrl) return false;
        try { const url = new URL(customer.avatarUrl,origin); return url.origin === new URL(origin).origin && url.pathname.split('/')[1] === 'api' && url.pathname.split('/')[2] === 'uploads' && url.pathname.split('/')[3] === id; }
        catch { return false; }
      });
      if (!linked) return new Response('Không tìm thấy tệp.', {status:404});
    }
    const bytes = await readFileBytes(file);
    const disposition = file.content_type.startsWith('image/') || file.content_type === 'video/mp4' ? 'inline' : 'attachment';
    return new Response(Buffer.from(bytes), {headers:{'Content-Type':file.content_type,'Content-Length':String(bytes.length),'Content-Disposition':`${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin'}});
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 404;
    return new Response(status === 429 ? 'Bạn tải tệp quá nhanh. Vui lòng thử lại sau.' : 'Không tìm thấy tệp hoặc tệp chưa sẵn sàng.', {status:status === 429 ? 429 : status === 503 ? 503 : 404,headers:{'Cache-Control':'no-store'}});
  }
}
