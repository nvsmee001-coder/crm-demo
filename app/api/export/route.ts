import {getChatGPTUser} from '@/app/chatgpt-auth';
import {loadWorkspace} from '@/lib/crm-store';
import {requireOwner} from '@/lib/access-store';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const user=await getChatGPTUser();
  if(!user) return Response.json({error:'Vui lòng đăng nhập.'},{status:401});
  const mode=new URL(request.url).searchParams.get('mode')==='live'?'live':'demo';
  try {
    await requireOwner(user);
    const workspace=await loadWorkspace(mode,user);
    const backup={format:'smee-crm-backup',version:1,exportedAt:new Date().toISOString(),mode,revision:workspace.revision,data:workspace.data};
    return new Response(JSON.stringify(backup,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="smee-${mode}-${new Date().toISOString().slice(0,10)}.json"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch(error) {
    const status=typeof error==='object' && error && 'status' in error ? Number(error.status) : 500;
    return Response.json({error:'Không thể xuất dữ liệu của không gian này.'},{status});
  }
}
