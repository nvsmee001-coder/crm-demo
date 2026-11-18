import AuthShell from '@/components/AuthShell';
import LogoutButton from '@/components/LogoutButton';
import '../auth.css';
export default function LogoutPage(){return <AuthShell><h2>Đăng xuất CRM</h2><p className="auth-description">Kết thúc phiên làm việc trên thiết bị này.</p><LogoutButton className="auth-submit"/><br/><a href="/" className="auth-back">← Về CRM</a></AuthShell>}
