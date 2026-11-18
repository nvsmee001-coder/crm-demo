import {getChatGPTUser} from '@/app/chatgpt-auth';
import {getAccessResponse,mutateAccess} from '@/lib/access-store';
import {CRMError} from '@/lib/crm-engine';
import type {AccessCommand} from '@/lib/crm-types';
import {assertSameOrigin,readJsonBody,rateLimit,HttpError} from '@/lib/http-security';
export const dynamic='force-dynamic';
const options={headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}};
function failure(error:unknown){if(error instanceof CRMError || error instanceof HttpError)return Response.json({error:error.message},{...options,status:error.status});console.error('Access request failed');return Response.json({error:'Không thể xử lý yêu cầu tài khoản.'},{...options,status:500});}
export async function GET(){try{const user=await getChatGPTUser();if(!user)throw new CRMError('Vui lòng đăng nhập.',401);return Response.json(await getAccessResponse(user),options);}catch(error){return failure(error);}}
export async function POST(request:Request){try{
  const user=await getChatGPTUser();if(!user)throw new CRMError('Vui lòng đăng nhập.',401);
  assertSameOrigin(request);
  await rateLimit('access:write:'+user.userId,30,60);
  const command=await readJsonBody(request,20_000) as AccessCommand;
  return Response.json(await mutateAccess(user,command),options);
}catch(error){return failure(error);}}
