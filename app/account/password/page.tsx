import AuthShell from '@/components/AuthShell';
import { requireCurrentUser } from '@/lib/auth/session';
import PasswordForm from './PasswordForm';
import '../../auth.css';
export const dynamic='force-dynamic';
export default async function PasswordPage(){await requireCurrentUser('/account/password');return <AuthShell><h2>Đổi mật khẩu</h2><p className="auth-description">Sau khi đổi, bạn sẽ đăng nhập lại trên các thiết bị.</p><PasswordForm/><p className="auth-footer"><a href="/account/mfa">Quản lý xác thực hai lớp</a></p></AuthShell>}
