import LoginForm from './LoginForm';
import AuthShell from '@/components/AuthShell';
import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import '../auth.css';
export const dynamic='force-dynamic';
export default async function LoginPage(){if(await getCurrentUser())redirect('/');return <AuthShell><h2>Chào mừng trở lại</h2><p className="auth-description">Đăng nhập bằng tài khoản CRM do công ty cấp.</p><LoginForm/></AuthShell>}
