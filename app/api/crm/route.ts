import { getChatGPTUser } from '../../chatgpt-auth';
import { CRMError } from '../../../lib/crm-engine';
import { readWorkspace, mutateWorkspace } from '../../../lib/crm-store';
import type { Command } from '../../../lib/crm-types';
import { assertSameOrigin, readJsonBody, rateLimit, HttpError } from '@/lib/http-security';

export const dynamic='force-dynamic';
const options={headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}};
function modeOf(request:Request):'demo'|'live' { const mode=new URL(request.url).searchParams.get('mode') || 'demo'; if(mode!=='demo' && mode!=='live') throw new CRMError('Không gian không hợp lệ.'); return mode; }
function failure(error:unknown) { if(error instanceof CRMError || error instanceof HttpError) return Response.json({error:error.message}, {...options,status:error.status}); console.error('CRM request failed'); return Response.json({error:'Không thể xử lý yêu cầu. Vui lòng thử lại.'},{...options,status:500}); }

export async function GET(request:Request) {
  try {
    const user=await getChatGPTUser();
    if(!user)throw new CRMError('Vui lòng đăng nhập để truy cập CRM.',401);
    await rateLimit('crm:read:'+user.userId,300,60);
    const {body,tag}=await readWorkspace(modeOf(request),user,request.headers.get('if-none-match'));
    const headers={...options.headers,'Cache-Control':'private, no-store',ETag:tag,Vary:'Cookie'};
    return body ? Response.json(body,{headers}) : new Response(null,{status:304,headers});
  } catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {
    const user=await getChatGPTUser();if(!user)throw new CRMError('Vui lòng đăng nhập để cập nhật CRM.',401);
    assertSameOrigin(request);
    await rateLimit('crm:write:'+user.userId,120,60);
    const command=await readJsonBody(request,1_000_000) as Command;
    return Response.json(await mutateWorkspace(modeOf(request),user,command),options);
  }catch(error){return failure(error);}
}
