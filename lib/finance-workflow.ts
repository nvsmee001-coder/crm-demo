import { CRMError } from './crm-error.js';
import type { AccessRole, Command, Project, ProjectLedger, ProjectReceipt, ReceiptCorrection, SalesActor, Workspace } from './crm-types.js';
import { collected } from './project-collections.js';
import { applyContractChange, assertUniqueContractNumber, reviewProposal } from './sales-workflow.js';

function check(valid: unknown, message: string): asserts valid {
  if (!valid) throw new CRMError(message);
}

function text(value: unknown, max: number, label: string) {
  check(typeof value === 'string' && value.trim() && value.length <= max, `${label} cần có nội dung, tối đa ${max} ký tự.`);
  return value.trim();
}

function correctionAmount(project: Project, ledger: ProjectLedger, receipt: ProjectReceipt, value: unknown) {
  const minimum = receipt.kind === 'opening' ? 0 : 1;
  const max = project.budget - (collected(ledger) - receipt.amount);
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= max && value !== receipt.amount,
    'Số tiền điều chỉnh phải thay đổi và tổng thu sau điều chỉnh phải nằm trong giá trị hợp đồng.');
  return value;
}

export function applyFinanceCommand(workspace: Workspace, project: Project, command: Command, actor: SalesActor, role: AccessRole, today: string) {
  const data = command.data ?? {};
  const ledger = project.ledger;
  const action = command.action;
  if (action === 'confirm_legacy_contract') {
    check(!project.contract, 'Hợp đồng đã được xác nhận.');
    const number = text(data.number,120,'Số hợp đồng hoặc mã đối chiếu');
    assertUniqueContractNumber(workspace,number);
    const signedOn = data.signedOn;
    check(typeof signedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(signedOn) && Number.isFinite(Date.parse(signedOn)) &&
      new Date(signedOn).toISOString().slice(0,10) === signedOn && signedOn <= today, 'Ngày ký hoặc ngày xác nhận không hợp lệ.');
    const budget = data.budget;
    check(typeof budget === 'number' && Number.isSafeInteger(budget) && budget > 0 && budget <= 1e12 &&
      (!ledger || budget >= collected(ledger)), 'Giá trị đối chiếu phải là số đồng nguyên dương và ít nhất bằng số đã thu.');
    const evidence = text(data.evidence,3000,'Căn cứ đối chiếu');
    project.contract = {source:'legacy', number, signedOn, evidence, signedValue:budget, signedScope:project.scope, confirmed:actor};
    project.budget = budget;
    return 'Xác nhận hợp đồng cũ';
  }

  if (action === 'request_legacy_contract_change' || action === 'review_legacy_contract_change') {
    check(project.contract?.source === 'legacy', 'Chỉ xử lý hợp đồng cũ đã đối chiếu tại đây.');
    return applyContractChange(project,project.legacyContractChanges ??= [],action === 'request_legacy_contract_change',data,actor,role);
  }

  check(ledger, 'Hãy mở sổ thu tiền trước khi xử lý phiếu.');
  const corrections = ledger.corrections ??= [];
  if (action === 'request_receipt_correction') {
    const receipt = ledger.receipts.find(item=>item.id === data.receiptId);
    check(receipt && !receipt.voided, 'Phiếu thu đang hoạt động không tồn tại.');
    check(!corrections.some(item=>item.receiptId === receipt.id && !item.reviewed), 'Phiếu đã có đề nghị đang chờ.');
    check(data.kind === 'amount' || (data.kind === 'void' && receipt.kind === 'payment'), 'Chọn điều chỉnh số tiền hoặc hủy phiếu hợp lệ.');
    const base = {id:crypto.randomUUID(),receiptId:receipt.id,reason:text(data.reason,500,'Lý do điều chỉnh'),requested:actor};
    const request: ReceiptCorrection = data.kind === 'void' ? {...base,kind:'void'} :
      {...base,kind:'amount',amount:correctionAmount(project,ledger,receipt,data.amount)};
    corrections.unshift(request);
    return 'Đề nghị xử lý phiếu thu';
  }

  const request = corrections.find(item=>item.id === data.correctionId);
  check(request && !request.reviewed, 'Đề nghị đã được xử lý hoặc không tồn tại.');
  const review = reviewProposal(data,actor);
  if (review.decision === 'approved') {
    const receipt = ledger.receipts.find(item=>item.id === request.receiptId);
    check(receipt && !receipt.voided, 'Phiếu thu đã được xử lý.');
    const amount = request.kind === 'amount' ? correctionAmount(project,ledger,receipt,request.amount) : undefined;
    receipt.voided = {at:actor.at,by:actor.name,reason:request.reason};
    if (amount !== undefined) ledger.receipts.unshift({
      id:crypto.randomUUID(),kind:receipt.kind,amount,date:receipt.date,reference:receipt.reference,createdAt:actor.at,createdBy:actor.name,
    });
  }
  request.reviewed = review;
  return review.decision === 'approved' ? 'Xác nhận xử lý phiếu thu' : 'Trả lại đề nghị xử lý phiếu thu';
}
