import { CRMError } from './crm-error.js';
import { collected, documentKey } from './project-collections.js';
import { SALES_ACTIONS, type AccessContext, type AccessRole, type Command, type ContractChange, type Deal, type Project, type QuoteVersion, type SalesAction, type SalesActor, type SalesReview, type Workspace } from './crm-types.js';

const maxMoney = 1_000_000_000_000;
const salesActions = new Set<Command['action']>(SALES_ACTIONS);
export const isSalesAction = (action: Command['action']): action is SalesAction => salesActions.has(action);

function check(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new CRMError(message, status);
}

function text(value: unknown, label: string, limit: number, required = true) {
  check(typeof value === 'string' && value.length <= limit && (!required || value.trim()), `${label} cần có nội dung phù hợp, tối đa ${limit} ký tự.`);
  return value.trim();
}

function integer(value: unknown, label: string, min = 0, max = maxMoney) {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max, `${label} không hợp lệ.`);
  return value;
}

function date(value: unknown, label: string, minimum: string) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && value >= minimum, `${label} phải từ ngày ${minimum} trở đi.`);
  return value;
}

export function reviewProposal(data: Record<string, unknown>, actor: SalesActor): SalesReview {
  check(data.decision === 'approved' || data.decision === 'returned', 'Chọn duyệt hoặc trả lại.');
  return {...actor, decision: data.decision, reason:text(data.reason ?? '', 'Lý do xử lý', 3000, data.decision === 'returned')};
}

export function assertUniqueContractNumber(workspace: Workspace, number: string) {
  const key = documentKey(number);
  check(!workspace.projects.some(item=>item.contract && documentKey(item.contract.number) === key), 'Số hợp đồng hoặc mã xác nhận đã tồn tại.');
}

export function applyContractChange(project: Project, changes: ContractChange[], request: boolean, data: Record<string, unknown>, actor: SalesActor, role: AccessRole) {
  const pending = changes.at(-1);
  if (request) {
    check(!pending || pending.reviewed, 'Đã có đề nghị điều chỉnh đang chờ xác nhận.');
    check(changes.length < 100, 'Hợp đồng đã đạt giới hạn đề nghị điều chỉnh.');
    check(project.status !== 'Hoàn tất', 'Cần mở lại dự án trước khi điều chỉnh hợp đồng.');
    const budget = integer(data.budget, 'Giá trị hợp đồng', Math.max(1, project.ledger ? collected(project.ledger) : 0));
    const scope = text(data.scope, 'Phạm vi hợp đồng', 5000);
    check(budget !== project.budget || scope !== project.scope, 'Giá trị và phạm vi chưa thay đổi.');
    changes.push({id:crypto.randomUUID(), previousBudget:project.budget, previousScope:project.scope, budget, scope, reason:text(data.reason, 'Lý do điều chỉnh', 3000), requested:actor});
    return 'Đề nghị điều chỉnh hợp đồng';
  }
  check(role === 'owner' || role === 'manager', 'Chỉ Quản lý hoặc Chủ sở hữu được xử lý điều chỉnh.',403);
  check(pending && pending.id === data.changeId && !pending.reviewed, 'Đề nghị điều chỉnh đã thay đổi.');
  const decision = reviewProposal(data, actor);
  if (decision.decision === 'approved') {
    if (actor.id === pending.requested.id) check(role === 'owner' && decision.reason, 'Cần người khác xác nhận. Chủ sở hữu có thể xác nhận ngoại lệ khi ghi rõ lý do.');
    check(project.status !== 'Hoàn tất', 'Cần mở lại dự án trước khi điều chỉnh hợp đồng.');
    check(!project.ledger || pending.budget >= collected(project.ledger), 'Giá trị sau điều chỉnh thấp hơn số đã thu.');
    project.budget = pending.budget;
    project.scope = pending.scope;
  }
  pending.reviewed = decision;
  return decision.decision === 'approved' ? 'Xác nhận điều chỉnh hợp đồng' : 'Trả lại đề nghị điều chỉnh';
}

function quoteDraft(w: Workspace, deal: Deal, data: Record<string, unknown>, today: string): QuoteVersion {
  const versions = deal.quotes ??= [];
  const last = versions.at(-1);
  check(last?.status !== 'submitted', 'Báo giá đang chờ duyệt.');
  check(last?.status === 'draft' ? data.version === last.version : data.version === undefined, 'Phiên bản báo giá đã thay đổi.');
  check(last?.status === 'draft' || versions.length < 30, 'Cơ hội đã đạt giới hạn 30 phiên bản báo giá.');
  const customer = w.customers.find(item => item.id === deal.customerId);
  const service = w.services.find(item => item.id === deal.serviceId);
  const owner = w.team.find(item => item.id === deal.owner) ?? w.team.find(item => item.name === deal.owner);
  check(customer && service && Number.isFinite(service.duration) && service.duration >= 0 && service.duration <= 3650, 'Thông tin khách hàng hoặc dịch vụ không đủ để lập báo giá.');
  check(Array.isArray(data.lines) && data.lines.length > 0 && data.lines.length <= 20, 'Báo giá cần từ 1 đến 20 dòng dịch vụ.');
  const lines = data.lines.map(value => {
    check(value && typeof value === 'object' && !Array.isArray(value), 'Dòng báo giá không hợp lệ.');
    const line = value as Record<string, unknown>;
    return {description:text(line.description, 'Tên hạng mục', 200), quantity:integer(line.quantity, 'Số lượng', 1, 1000), unitPrice:integer(line.unitPrice, 'Đơn giá')};
  });
  const subtotal = integer(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), 'Tổng hạng mục', 1);
  const discount = integer(data.discount, 'Chiết khấu', 0, subtotal - 1);
  const taxBasisPoints = integer(data.taxBasisPoints, 'Thuế suất', 0, 10_000);
  const taxableAmount = subtotal - discount;
  const tax = Number((BigInt(taxableAmount) * BigInt(taxBasisPoints) + BigInt(5_000)) / BigInt(10_000));
  const total = integer(taxableAmount + tax, 'Tổng thanh toán', 1);
  const version = last?.status === 'draft' ? last.version : (last?.version ?? 0) + 1;
  return {
    version, code: `BG-${deal.id.toUpperCase()}-V${version}`, status:'draft', title:deal.name, company:w.settings.companyName,
    recipient:{name:customer.name, contact:customer.contact, email:customer.email, phone:customer.phone},
    contact:{name:owner?.name ?? deal.owner, email:owner?.email ?? ''},
    service:{name:service.name, duration:Math.ceil(service.duration), exclusions:service.exclusions, revisions:service.revisions},
    validUntil:date(data.validUntil, 'Ngày hết hiệu lực', today), scope:text(data.scope, 'Phạm vi', 5000), terms:text(data.terms, 'Điều khoản', 5000),
    lines, subtotal, discount, taxBasisPoints, tax, total,
  };
}

export function applySalesCommand(w: Workspace, command: Command & {action: SalesAction}, viewer: Pick<AccessContext,'userId'|'name'|'role'|'memberId'> | undefined, now: string, today: string) {
  check(viewer, 'Cần đăng nhập để cập nhật bán hàng.', 401);
  const actor: SalesActor = {id:viewer.userId, name:viewer.name, at:now};
  const data = command.data ?? {};
  const deal = w.deals.find(item => item.id === command.id);
  check(deal, 'Cơ hội không tồn tại.');
  const lastQuote = deal.quotes?.at(-1);
  const lastWin = deal.winRequests?.at(-1);
  const management = viewer.role === 'owner' || viewer.role === 'manager';
  if (command.action === 'request_contract_change' || command.action === 'review_contract_change') {
    const project = w.projects.find(item => item.id === deal.projectId && item.contract && item.contract.source !== 'legacy' && item.contract.dealId === deal.id);
    check(project, 'Cơ hội chưa có hợp đồng xác nhận.');
    return applyContractChange(project,deal.contractChanges ??= [],command.action === 'request_contract_change',data,actor,viewer.role);
  }

  check(!deal.projectId && !['Đã chốt','Không thành công'].includes(deal.stage), 'Cơ hội đã đóng.');
  if (command.action === 'save_quote') {
    check(!lastWin || lastWin.reviewed, 'Cơ hội đang chờ xác nhận chốt thắng.');
    const draft = quoteDraft(w, deal, data, today);
    if (lastQuote?.status === 'draft') deal.quotes!.pop();
    deal.quotes!.push(draft);
    return `Lưu báo giá V${draft.version}`;
  }
  if (command.action === 'submit_quote' || command.action === 'review_quote') {
    check(lastQuote && lastQuote.version === data.version, 'Phiên bản báo giá đã thay đổi.');
    if (command.action === 'submit_quote') {
      check(lastQuote.status === 'draft', 'Chỉ trình duyệt bản nháp.');
      date(lastQuote.validUntil, 'Ngày hết hiệu lực', today);
      lastQuote.status = 'submitted';
      lastQuote.submitted = actor;
      return `Trình duyệt báo giá V${lastQuote.version}`;
    }
    check(management, 'Chỉ Quản lý hoặc Chủ sở hữu được duyệt báo giá.', 403);
    check(lastQuote.status === 'submitted', 'Báo giá đã được xử lý.');
    const decision = reviewProposal(data, actor);
    if (decision.decision === 'approved') date(lastQuote.validUntil, 'Ngày hết hiệu lực', today);
    lastQuote.status = decision.decision;
    lastQuote.reviewed = decision;
    return `${decision.decision === 'approved' ? 'Duyệt' : 'Trả lại'} báo giá V${lastQuote.version}`;
  }

  if (command.action === 'request_deal_win') {
    check(lastQuote?.status === 'approved' && lastQuote.version === data.version, 'Cần duyệt phiên bản báo giá mới nhất trước khi đề nghị chốt.');
    date(lastQuote.validUntil, 'Ngày hết hiệu lực', today);
    check(!lastWin || lastWin.reviewed, 'Đã có đề nghị chốt đang chờ xác nhận.');
    const requests = deal.winRequests ??= [];
    check(requests.length < 30, 'Cơ hội đã đạt giới hạn đề nghị chốt.');
    requests.push({id:crypto.randomUUID(), quoteVersion:lastQuote.version, requested:actor, evidence:text(data.evidence, 'Căn cứ thỏa thuận', 3000)});
    return 'Đề nghị chốt thắng';
  }

  check(management, 'Chỉ Quản lý hoặc Chủ sở hữu được xác nhận chốt thắng.', 403);
  check(lastWin && lastWin.id === data.requestId && !lastWin.reviewed, 'Đề nghị chốt đã thay đổi.');
  const decision = reviewProposal(data, actor);
  if (decision.decision === 'returned') {
    lastWin.reviewed = decision;
    return 'Trả lại đề nghị chốt thắng';
  }
  check(lastQuote?.status === 'approved' && lastQuote.version === lastWin.quoteVersion, 'Báo giá đã thay đổi.');
  date(lastQuote.validUntil, 'Ngày hết hiệu lực', today);
  const contractNumber = text(data.contractNumber, 'Số hợp đồng hoặc mã xác nhận', 120);
  assertUniqueContractNumber(w,contractNumber);
  const defaultDue = new Date(`${today}T00:00:00Z`);
  defaultDue.setUTCDate(defaultDue.getUTCDate() + lastQuote.service.duration);
  const dueDate = date(data.dueDate ?? defaultDue.toISOString().slice(0, 10), 'Hạn bàn giao', today);
  const projectOwner = viewer.role === 'owner' ? 'member-admin' : viewer.memberId;
  check(projectOwner && w.team.some(item => item.id === projectOwner), 'Chưa xác định được người phụ trách dự án.');
  deal.projectId = crypto.randomUUID();
  deal.stage = 'Đã chốt';
  deal.probability = 100;
  deal.value = lastQuote.total;
  deal.scope = lastQuote.scope;
  deal.stageChangedAt = now;
  (deal.stageHistory ??= []).push({stage:deal.stage, at:now, actor:actor.name});
  lastWin.reviewed = decision;
  lastWin.contractNumber = contractNumber;
  w.projects.push({
    id:deal.projectId, name:lastQuote.title, customerId:deal.customerId, serviceId:deal.serviceId, owner:projectOwner,
    status:'Đang triển khai', startDate:today, dueDate, originalDueDate:dueDate, budget:lastQuote.total, cost:0,
    scope:lastQuote.scope, exclusions:lastQuote.service.exclusions, revisions:lastQuote.service.revisions, acceptance:'',
    contract:{dealId:deal.id, quoteVersion:lastQuote.version, number:contractNumber, evidence:lastWin.evidence, signedValue:lastQuote.total, signedScope:lastQuote.scope, confirmed:actor},
  });
  return 'Xác nhận hợp đồng và tạo dự án';
}
