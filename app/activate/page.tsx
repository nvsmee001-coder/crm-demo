import AuthShell from '@/components/AuthShell';
import ActivateForm from './ActivateForm';
import '../auth.css';
export default function ActivatePage(){return <AuthShell><h2>Đặt mật khẩu CRM</h2><p className="auth-description">Tạo mật khẩu riêng để sử dụng tài khoản được công ty cấp.</p><ActivateForm/></AuthShell>}
