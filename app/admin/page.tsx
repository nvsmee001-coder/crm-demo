import { redirect } from 'next/navigation';
import { getAdminDashboard } from '@/lib/access-store';
import { requireCurrentUser } from '@/lib/auth/session';
import { CRMError } from '@/lib/crm-engine';
import AdminConsole from './AdminConsole';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Quản trị hệ thống · SMEE CRM' };

export default async function AdminPage() {
  const user = await requireCurrentUser('/admin');
  const dashboard = await getAdminDashboard(user).catch((error: unknown) => {
    if (error instanceof CRMError && error.status === 403) redirect('/');
    throw error;
  });
  return <AdminConsole initial={dashboard} />;
}
