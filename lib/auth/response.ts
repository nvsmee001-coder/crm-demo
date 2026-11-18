export function authFailure(error: unknown): Response {
  const status=error && typeof error==='object' && 'status' in error && typeof error.status==='number' && [400,401,403,408,409,413,415,429,503].includes(error.status)?error.status:500;
  const message=status===500?'Không thể xử lý yêu cầu. Vui lòng thử lại.':error instanceof Error?error.message:'Yêu cầu không hợp lệ.';
  if(status===500)console.error('Authentication request failed');
  return Response.json({error:message},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===429?{'Retry-After':'60'}:{})}});
}
