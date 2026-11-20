import { redirect } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import { getMfaSession } from '@/lib/auth/session';
import MfaForm from './MfaForm';
import '../../auth.css';

export const dynamic='force-dynamic';

export default async function MfaPage() {
  const session=await getMfaSession();
  if (!session) redirect('/login?returnTo=%2Faccount%2Fmfa');
  return <AuthShell>
    <h2>Xác thực hai lớp</h2>
    <p className="auth-description">{session.setupOnly?'Thiết lập ứng dụng xác thực để vào CRM.':
      session.enabled?`Đã bật. Còn ${session.remaining} mã khôi phục chưa dùng.`:'Bảo vệ tài khoản bằng một mã từ ứng dụng xác thực khi đăng nhập.'}</p>
    <MfaForm email={session.user.email} setupOnly={session.setupOnly} enabled={session.enabled} available={session.available}/>
  </AuthShell>;
}
