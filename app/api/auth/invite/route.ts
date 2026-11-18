import { getCurrentUser } from '@/lib/auth/session';
import { requireOwner } from '@/lib/access-store';
import { assertSameOrigin, rateLimit, readJsonBody } from '@/lib/http-security';
import { AuthError, issueSetupToken } from '@/lib/auth/store';
import { authFailure } from '@/lib/auth/response';
export const runtime='nodejs';
export async function POST(request:Request){try{
  assertSameOrigin(request);const user=await getCurrentUser();if(!user)throw new AuthError('Vui lòng đăng nhập.',401);
  await requireOwner(user);await rateLimit('invite:user:'+user.userId,30,3600);
  const body=await readJsonBody(request,4096);const token=await issueSetupToken(body.accountId,user.userId);
  if(!process.env.APP_ORIGIN)throw new AuthError('Máy chủ chưa cấu hình APP_ORIGIN.',503);
  const url=new URL('/activate',process.env.APP_ORIGIN);url.hash='token='+token;
  return Response.json({url:url.toString(),expiresInSeconds:3600},{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}catch(error){return authFailure(error)}}
