import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { loadWorkspace } from '@/lib/crm-store';
import PrintButton from '@/components/PrintButton';
import BrandLogo from '@/components/BrandLogo';
import { notFound } from 'next/navigation';
import { CRMError } from '@/lib/crm-engine';

export const dynamic = 'force-dynamic';
const money = (n: number) => new Intl.NumberFormat('vi-VN', {style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
export default async function QuotePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{mode?:string;version?:string}>}) {
  const {id} = await params;
  const q = await searchParams;
  const mode = q.mode ?? 'live';
  if (mode !== 'live' && mode !== 'demo') notFound();
  if (q.version !== undefined && !/^[1-9]\d?$/.test(q.version)) notFound();
  const returnQuery = new URLSearchParams({mode});
  if (q.version) returnQuery.set('version',q.version);
  const user = await requireChatGPTUser(`/quotes/${encodeURIComponent(id)}?${returnQuery}`);
  let workspace;
  try { workspace=await loadWorkspace(mode,user); }
  catch(error) { if(error instanceof CRMError && [401,403].includes(error.status))notFound();throw error; }
  const {data:w}=workspace;
  const deal = w.deals.find(d=>d.id===id);
  if (!deal) notFound();
  const version = q.version ? deal.quotes?.find(item=>item.version === Number(q.version) && item.status === 'approved') : deal.quotes?.findLast(item=>item.status === 'approved');
  if (!version && (mode === 'live' || q.version)) notFound();
  const customer = version?.recipient ?? w.customers.find(c=>c.id===deal.customerId);
  const service = version?.service ?? w.services.find(s=>s.id===deal.serviceId);
  const owner = version?.contact ?? w.team.find(m=>m.id===deal.owner || m.name===deal.owner);
  return <main className="quote-page">
    <style>{`
      .quote-page{min-height:100vh;background:#f6f7f9;color:#25252b;padding:32px 20px;font-family:"Be Vietnam Pro",Arial,sans-serif;font-size:14px;line-height:1.65}.quote-toolbar{max-width:820px;margin:0 auto 22px;display:flex;align-items:center;justify-content:space-between}.quote-toolbar a{color:#696974;text-decoration:none}.quote-print{background:#d62920;color:white;padding:10px 18px;border:0;border-radius:12px;cursor:pointer;font-weight:600}.quote-paper{max-width:820px;margin:auto;background:white;border:1px solid #e9e9ee;border-radius:14px;padding:55px}.quote-brand{margin-bottom:12px}.quote-brand .quote-brand-logo{display:block;width:150px;max-width:100%;height:auto;overflow:visible}.quote-head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #d62920;padding-bottom:30px}.quote-code{font-size:11px;color:#73737d}.quote-paper h1{font-size:28px;letter-spacing:-1px;margin:40px 0 24px}.quote-info{display:grid;grid-template-columns:1fr 1fr;gap:25px;margin-bottom:35px}.quote-label{font-size:10px;letter-spacing:1.4px;font-weight:700;color:#73737d;text-transform:uppercase}.quote-paper table{width:100%;border-collapse:collapse;margin:30px 0}.quote-paper th{font-size:11px;text-align:left;color:#73737d;padding:14px 10px;background:#fff3f1}.quote-paper td{padding:20px 10px;border-bottom:1px solid #eee}.quote-total{text-align:right;font-size:21px;font-weight:700;color:#b71f1a;margin:15px 0 40px}.quote-section{margin-top:28px;white-space:pre-wrap}.quote-section h2{font-size:13px;white-space:normal;color:#b71f1a}.quote-footer{font-size:11px;color:#73737d;border-top:1px solid #eee;margin-top:45px;padding-top:20px}@media(max-width:600px){.quote-paper{padding:25px}.quote-info{grid-template-columns:1fr}.quote-head{flex-direction:column}}@media print{.quote-brand .quote-brand-logo{width:150px;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}.quote-toolbar{display:none}.quote-page{padding:0;background:white}.quote-paper{border:0;padding:20px;border-radius:0;max-width:100%}@page{size:A4;margin:18mm}}
    `}</style>
    <div className="quote-toolbar"><a href="/">← Trở về SMEE CRM</a><PrintButton /></div>
    <article className="quote-paper">
      <header className="quote-head"><div><div className="quote-brand"><BrandLogo className="quote-brand-logo" /></div><div>{version?.company ?? w.settings.companyName}</div></div><div className="quote-code">BÁO GIÁ DỊCH VỤ<br/>{version?.code ?? `BG-${deal.id.slice(-8).toUpperCase()}`}<br/>{version ? `Phiên bản ${version.version}` : 'DỮ LIỆU MẪU · KHÔNG DÙNG GIAO DỊCH'}</div></header>
      <h1>{version?.title ?? deal.name}</h1>
      <div className="quote-info"><div><div className="quote-label">Kính gửi</div><strong>{customer?.name}</strong><div>{customer?.contact}</div><div>{customer?.email}</div><div>{customer?.phone}</div></div><div><div className="quote-label">Người phụ trách</div><strong>{owner?.name || deal.owner}</strong><div>{owner?.email}</div>{version ? <div>Hiệu lực đến {version.validUntil.split('-').reverse().join('/')}</div> : <div>Ngày dự kiến chốt {deal.closeDate.split('-').reverse().join('/')}</div>}</div></div>
      <div>{service?.name || 'Dịch vụ'} · Thời gian dự kiến {service?.duration || 0} ngày</div>
      <table><thead><tr><th>Hạng mục dịch vụ</th><th>Số lượng</th><th>Đơn giá</th><th style={{textAlign:'right'}}>Thành tiền</th></tr></thead><tbody>
        {(version?.lines ?? [{description:service?.name || 'Dịch vụ',quantity:1,unitPrice:deal.value}]).map((line,index)=><tr key={index}>
          <td>{line.description}</td><td>{line.quantity}</td><td>{money(line.unitPrice)}</td><td style={{textAlign:'right'}}>{money(line.quantity * line.unitPrice)}</td>
        </tr>)}
      </tbody></table>
      {version && <div style={{textAlign:'right'}}><div>Tạm tính {money(version.subtotal)}</div><div>Chiết khấu {money(version.discount)}</div><div>Thuế {version.taxBasisPoints/100}% trên giá sau chiết khấu · {money(version.tax)}</div></div>}
      <div className="quote-total">Tổng giá trị {money(version?.total ?? deal.value)}</div>
      <section className="quote-section"><h2>Phạm vi và đầu ra</h2>{version?.scope ?? (deal.scope || w.services.find(s=>s.id===deal.serviceId)?.deliverables || 'Cần thống nhất trước khi chốt.')}</section>
      <section className="quote-section"><h2>Ngoài phạm vi</h2>{service?.exclusions || 'Theo thỏa thuận trong hợp đồng.'}</section>
      <section className="quote-section"><h2>Chỉnh sửa và phát sinh</h2>Số vòng sửa trong gói {service?.revisions ?? 0}. Các yêu cầu vượt phạm vi cần được xác nhận riêng về chi phí và tiến độ trước khi thực hiện.</section>
      {version && <section className="quote-section"><h2>Điều khoản thanh toán và thực hiện</h2>{version.terms}</section>}
    </article>
  </main>;
}
