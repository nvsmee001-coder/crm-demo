import { getChatGPTUser } from '@/app/chatgpt-auth';
import { requireBusinessManager } from '@/lib/access-store';
import { assertSameOrigin, readBodyLimited, rateLimit } from '@/lib/http-security';
import { MAX_FILE_BYTES, saveFile } from '@/lib/file-store';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({error:'Vui lòng đăng nhập để tải tệp.'}, {status:401});
    const access = await requireBusinessManager(user);
    assertSameOrigin(request);
    await rateLimit('upload:' + user.userId, 20, 60);
    const type = request.headers.get('content-type') || '';
    if (!/^multipart\/form-data;\s*boundary=/i.test(type)) return Response.json({error:'Yêu cầu tải tệp không hợp lệ.'}, {status:415});
    const body = await readBodyLimited(request, MAX_FILE_BYTES + 100_000);
    const form = await new Response(Buffer.from(body), {headers:{'Content-Type':type}}).formData();
    const file = form.get('file');
    if (!(file instanceof File) || form.getAll('file').length !== 1) return Response.json({error:'Chọn một tệp hợp lệ.'}, {status:400});
    const saved = await saveFile({bytes:new Uint8Array(await file.arrayBuffer()),type:file.type,name:file.name,ownerId:access.ownerId,userId:user.userId});
    return Response.json({url:`/api/uploads/${saved.id}/${encodeURIComponent(saved.name)}`,name:saved.name,size:saved.size_bytes}, {status:201,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500;
    const message = status < 500 && error instanceof Error ? error.message : status === 503 ? 'Dịch vụ lưu trữ hoặc quét tệp chưa sẵn sàng. Tệp chưa được lưu.' : 'Không thể tải tệp. Vui lòng thử lại.';
    return Response.json({error:message}, {status,headers:{'Cache-Control':'no-store'}});
  }
}
