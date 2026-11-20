'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, History, LockKeyhole, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import AccessSettings from '@/components/AccessSettings';
import BrandLogo from '@/components/BrandLogo';
import LogoutButton from '@/components/LogoutButton';
import type { AdminDashboard } from '@/lib/admin-types';

const eventNames: Record<string, string> = {
  account_created: 'Cấp quyền tài khoản',
  account_enabled: 'Mở khóa tài khoản',
  account_disabled: 'Khóa tài khoản',
  upsert: 'Cập nhật quyền truy cập',
  bind_account: 'Liên kết nhân sự',
  login: 'Đăng nhập',
  setup_link_created: 'Tạo liên kết đặt mật khẩu',
  password_activated: 'Đặt mật khẩu qua liên kết',
  password_changed: 'Đổi mật khẩu',
  owner_provisioned: 'Tạo tài khoản chủ sở hữu',
  owner_password_reset_cli: 'Đặt lại mật khẩu chủ sở hữu',
  mfa_enrolled: 'Thiết lập xác thực hai lớp',
  mfa_recovery_used: 'Dùng mã khôi phục',
  mfa_reset: 'Cấp lại thiết bị xác thực',
  owner_mfa_reset_cli: 'Đặt lại xác thực hai lớp của chủ sở hữu',
  offboarding: 'Bàn giao công việc và khóa tài khoản',
};
const eventTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short',
});

export default function AdminConsole({ initial }: { initial: AdminDashboard }) {
  const [dashboard, setDashboard] = useState(initial);
  const [section, setSection] = useState<'accounts' | 'audit'>('accounts');
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const accounts = dashboard.access.accounts || [];
  const metrics = [
    { label: 'Tài khoản nhân viên', value: accounts.length, icon: Users },
    { label: 'Đang hoạt động', value: accounts.filter(a => a.active && a.bound).length, icon: CheckCircle2 },
    { label: 'Chờ kích hoạt', value: accounts.filter(a => a.active && !a.bound).length, icon: Clock3 },
    { label: 'Đã khóa', value: accounts.filter(a => !a.active).length, icon: LockKeyhole },
  ];
  function notify(text: string, error = false) { setNotice({ text, error }); }

  async function refreshAudit() {
    setRefreshing(true);
    try {
      const response = await fetch('/api/admin', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Chưa tải được nhật ký.');
      setDashboard(body);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Chưa tải được nhật ký.', true);
    } finally {
      setRefreshing(false);
    }
  }

  return <main className="admin-console">
    <header className="admin-masthead">
      <div className="admin-mast-inner">
        <div className="admin-identity"><BrandLogo /><span>{dashboard.companyName}</span></div>
        <div className="admin-header-actions">
          <a href="/"><ArrowLeft size={15} />Về CRM</a>
          <LogoutButton className="admin-logout" />
        </div>
      </div>
    </header>
    <div className="admin-content">
      <div className="admin-title">
        <div><h1>Quản trị hệ thống</h1><p>Quản lý tài khoản nhân viên và theo dõi hoạt động truy cập CRM.</p></div>
        <div className="admin-current"><ShieldCheck size={22} /><div><strong>Chủ sở hữu</strong><span>{dashboard.access.viewer.email}</span></div></div>
      </div>
      <dl className="admin-metrics">
        {metrics.map(({ label, value, icon: Icon }) => <div key={label}>
          <dt><Icon size={16} />{label}</dt><dd>{value}</dd>
        </div>)}
      </dl>
      <nav className="admin-sections" aria-label="Mục quản trị">
        <button aria-pressed={section === 'accounts'} onClick={() => setSection('accounts')}><Users size={16} />Tài khoản</button>
        <button aria-pressed={section === 'audit'} onClick={() => setSection('audit')}><History size={16} />Nhật ký truy cập</button>
      </nav>
      {section === 'accounts'
        ? <AccessSettings initialDashboard={dashboard} onDashboard={setDashboard} onNotify={notify} />
        : <section className="admin-audit">
          <header><div><h2>Nhật ký truy cập</h2><p>Tối đa 40 sự kiện gần nhất, theo giờ Việt Nam.</p></div>
            <button className="btn" disabled={refreshing} onClick={refreshAudit}><RefreshCw size={14} />{refreshing ? 'Đang tải…' : 'Tải lại'}</button>
          </header>
          {dashboard.events.length ? <div className="admin-audit-scroll"><table>
            <thead><tr><th>Thời gian</th><th>Hoạt động</th><th>Người thực hiện</th><th>Tài khoản liên quan</th></tr></thead>
            <tbody>{dashboard.events.map(event => <tr key={event.id}>
              <td><time dateTime={event.at}>{eventTime.format(new Date(event.at))}</time></td>
              <td>{eventNames[event.action] || 'Thay đổi tài khoản'}{event.reason&&<div className="account-audit-reason">{event.reason}</div>}</td>
              <td>{event.actor || 'Hệ thống'}</td><td>{event.subject || '—'}</td>
            </tr>)}</tbody>
          </table></div> : <p className="admin-no-match">Chưa có sự kiện truy cập.</p>}
        </section>}
    </div>
    {notice && <div className={'admin-notice' + (notice.error ? ' is-error' : '')} role={notice.error ? 'alert' : 'status'}>
      {notice.text}<button onClick={() => setNotice(null)} aria-label="Đóng thông báo"><X size={16} /></button>
    </div>}
  </main>;
}
