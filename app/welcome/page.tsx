import { ArrowRight, CalendarCheck2, Check, Headphones, Sparkles, UsersRound } from 'lucide-react';
import { chatGPTSignInPath } from '@/app/chatgpt-auth';
import BrandLogo from '@/components/BrandLogo';

export default function Welcome() {
  return (
    <main className="smee-welcome">
      <article className="smee-welcome-card">
        <section className="smee-welcome-copy">
          <div className="smee-welcome-brand" aria-label="SMEE agency">
            <BrandLogo />
          </div>
          <span className="smee-welcome-kicker"><Sparkles size={14} /> SMEE WORKSPACE</span>
          <h1>Kết nối tốt.<br /><span>Cùng tiến xa.</span></h1>
          <p className="smee-welcome-intro">Quản lý khách hàng, lịch chăm sóc và công việc trong một không gian chung của SMEE.</p>
          <div className="smee-welcome-features" aria-label="Trong không gian SMEE">
            <span><UsersRound size={15} /> Hiểu khách hàng</span>
            <span><Headphones size={15} /> Kết nối đúng lúc</span>
            <span><CalendarCheck2 size={15} /> Rõ việc cần làm</span>
          </div>
          <a className="smee-welcome-login" href={chatGPTSignInPath('/')} target="_top">
            <span>Đăng nhập tài khoản SMEE</span><ArrowRight size={19} />
          </a>
          <p className="smee-welcome-hint">Dùng email đã được cấp quyền để vào không gian của bạn.</p>
        </section>
        <div className="smee-welcome-art" aria-hidden="true">
          <span className="smee-welcome-art-caption">TỪ KẾT NỐI ĐẾN ĐỒNG HÀNH</span>
          <div className="smee-welcome-orbit orbit-one" />
          <div className="smee-welcome-orbit orbit-two" />
          <div className="smee-welcome-orb"><BrandLogo decorative /></div>
          <div className="smee-welcome-float float-contact">
            <span className="smee-welcome-mini-avatar"><UsersRound size={22} /></span>
            <div><strong>Hồ sơ khách hàng</strong><small>Rõ nhu cầu, đủ thông tin.</small></div>
            <span className="smee-welcome-check"><Check size={13} /></span>
          </div>
          <div className="smee-welcome-float float-todo">
            <span className="smee-welcome-mini-icon"><CalendarCheck2 size={22} /></span>
            <strong>Lịch chăm sóc</strong><small>Đúng người. Đúng lúc.</small>
            <span className="smee-welcome-todo-line"><i /><i /><i /></span>
          </div>
          <span className="smee-welcome-spark spark-one"><Sparkles size={28} /></span>
          <span className="smee-welcome-spark spark-two">✳</span>
          <div className="smee-welcome-art-footer"><span /><span /><span /><small>Đồng hành từ những việc nhỏ.</small></div>
        </div>
      </article>
      <footer className="smee-welcome-footer">SMEE agency <span>·</span> Cùng nhau làm tốt hơn.</footer>
    </main>
  );
}
