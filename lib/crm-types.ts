export type Collection = 'customers' | 'services' | 'deals' | 'projects' | 'tasks' | 'contents' | 'changes' | 'issues' | 'assets' | 'team';
export interface CustomerInteraction { id: string; at: string; channel: 'Điện thoại'|'Telegram'|'Email'|'Gặp mặt'|'Khác'; outcome: string; note: string; actor: string; nextFollowUp?: string; nextAction?: string }
export interface CustomerNote { id: string; body: string; createdAt: string; updatedAt?: string; actor: string }
export interface CustomerAction { id: string; title: string; type: 'Công việc'|'Cuộc gọi'|'Cuộc hẹn'; dueDate: string; time?: string; owner: string; status: 'Cần làm'|'Hoàn tất'|'Đã hủy'; notes: string; createdAt: string; updatedAt: string; completedAt?: string; result?: string }
export interface Customer { id: string; prospectedBy?: string; name: string; industry: string; contact: string; email: string; phone: string; owner: string; status: string; notes: string; color?: string; source?: string; priority?: 'Cao'|'Trung bình'|'Thấp'; nextFollowUp?: string; nextAction?: string; telegram?: string; createdAt?: string; updatedAt?: string; lastContactAt?: string; interactions?: CustomerInteraction[]; telesalesOwner?: string; telesalesStatus?: 'Chưa chuyển'|'Chờ gọi'|'Đang chăm sóc'|'Hẹn gọi lại'|'Đủ điều kiện'|'Không phù hợp'|'Sai số'|'Đã bàn giao'; salesHandoff?:SalesHandoff; telesalesQueuedAt?: string; telesalesHandoffNote?: string; telesalesLastCallAt?: string; telesalesLastOutcome?: string; telesalesAttempts?: number; jobTitle?: string; address?: string; website?: string; background?: string; avatarUrl?: string; favorite?: boolean; tags?: string[]; additionalPhones?: {label:string;value:string}[]; additionalEmails?: {label:string;value:string}[]; socialLinks?: {label:string;url:string}[]; relationships?: {customerId:string;label:string}[]; notesLog?: CustomerNote[]; actions?: CustomerAction[] }
export interface Service { id: string; name: string; category: string; price: number; unit: string; duration: number; deliverables: string; exclusions: string; revisions: number; active: boolean }
export interface QuoteLine { description: string; quantity: number; unitPrice: number }
export interface SalesActor { id: string; name: string; at: string }
export interface SalesHandoff {
  id: string; customerName: string; fromMemberId: string; fromName: string; toMemberId: string; toName: string;
  summary: string; dueDate: string; requested: SalesActor;
  resolution?: SalesActor & {decision:'accepted'|'returned'|'cancelled';reason:string};
}
export interface SalesHandoffRow extends Omit<SalesHandoff,'requested'|'resolution'> {
  customerId: string; requestedAt:string; resolution?:Omit<NonNullable<SalesHandoff['resolution']>,'id'>;
}
export interface SalesReview extends SalesActor { decision: 'approved' | 'returned'; reason: string }
export interface QuoteVersion {
  version: number; code: string; status: 'draft' | 'submitted' | 'approved' | 'returned';
  title: string; company: string; recipient: {name:string;contact:string;email:string;phone:string};
  contact: {name:string;email:string}; service: {name:string;duration:number;exclusions:string;revisions:number};
  validUntil: string; scope: string; terms: string; lines: QuoteLine[]; discount: number; taxBasisPoints: number;
  subtotal: number; tax: number; total: number; submitted?: SalesActor; reviewed?: SalesReview;
}
export interface WinRequest { id: string; quoteVersion: number; evidence: string; requested: SalesActor; reviewed?: SalesReview; contractNumber?: string }
export interface ContractChange { id: string; previousBudget: number; previousScope: string; budget: number; scope: string; reason: string; requested: SalesActor; reviewed?: SalesReview }
interface ContractEvidence { number: string; evidence: string; signedValue: number; signedScope: string; confirmed: SalesActor }
export type Contract = ContractEvidence & ({source?:'quote';dealId:string;quoteVersion:number}|{source:'legacy';signedOn:string});
export interface Deal { id: string; name: string; customerId: string; serviceId: string; value: number; stage: string; owner: string; closeDate: string; nextAction: string; scope: string; projectId?: string; probability?: number; description?: string; createdAt?: string; createdBy?: string; stageChangedAt?: string; stageHistory?: {stage:string;at:string;actor:string}[]; lossReason?:string; quotes?:QuoteVersion[]; winRequests?:WinRequest[]; contractChanges?:ContractChange[] }
export interface ProjectReceipt {
  id: string; kind: 'opening'|'payment'; amount: number; date: string; reference: string;
  createdAt: string; createdBy: string; voided?: { at: string; by: string; reason: string };
}
export type ReceiptCorrection = {id:string;receiptId:string;reason:string;requested:SalesActor;reviewed?:SalesReview} & ({kind:'void'}|{kind:'amount';amount:number});
export interface ProjectLedger { openedAt: string; openedBy: string; paymentDue: string; receipts: ProjectReceipt[]; corrections?:ReceiptCorrection[] }
export interface ProjectOpenWork { tasks:number; contents:number; issues:number }
export interface ProjectAcceptance { actor:SalesActor; evidence:string; exception?:{reason:string;open:ProjectOpenWork} }
export interface Project { id: string; name: string; customerId: string; serviceId: string; owner: string; status: string; startDate: string; dueDate: string; originalDueDate: string; budget: number; cost: number; scope: string; exclusions: string; revisions: number; acceptance: string; acceptanceRecord?:ProjectAcceptance; handoffNote?: string; ledger?: ProjectLedger; contract?:Contract; legacyContractChanges?:ContractChange[] }
export interface Task { id: string; projectId: string; name: string; owner: string; status: string; dueDate: string; hours: number; hourlyCost: number; notes: string; deliveryResult?:string }
export interface Content { id: string; projectId: string; title: string; channel: string; batch: string; publishDate: string; status: string; owner: string; version: number; body: string; feedback: string; approvedVersion?: number; approvedAt?: string; approvedBy?: string; approvalConfirmation?: string; publicationReview?:SalesReview & {version:number}; history?: {version:number;body:string;title:string;url:string;channel?:string;approvedAt?:string;approvedBy?:string;confirmation?:string}[]; url: string }
export interface Change { id: string; projectId: string; title: string; reason: string; fee: number; extraDays: number; status: string; customerConfirmed: boolean; confirmation: string; createdAt: string }
export interface Issue { id: string; projectId: string; title: string; description: string; owner: string; priority: string; status: string; dueDate: string; createdAt: string; resolvedAt?: string; resolution?: string }
export interface Asset { id: string; name: string; category: string; industry: string; serviceId: string; description: string; url: string; shareable: boolean; watermark: boolean }
export interface TeamMember { id: string; name: string; role: string; email: string; color: string }
export interface Activity { id: string; text: string; time: string; actor: string; kind: string; entityId?: string; details?: Record<string, {before:unknown;after:unknown}> }
export interface Workspace { customers: Customer[]; services: Service[]; deals: Deal[]; projects: Project[]; tasks: Task[]; contents: Content[]; changes: Change[]; issues: Issue[]; assets: Asset[]; team: TeamMember[]; activities: Activity[]; settings: { companyName: string; slogan: string; escalationHours: number; currency: string; contentApprovalRequired?:boolean }; }
export const COLLECTION_ACTIONS = ['open_project_ledger','set_payment_due','record_project_receipt','void_project_receipt','confirm_legacy_contract','request_receipt_correction','review_receipt_correction','request_legacy_contract_change','review_legacy_contract_change'] as const;
export type CollectionAction = typeof COLLECTION_ACTIONS[number];
export const SALES_ACTIONS = ['save_quote', 'submit_quote', 'review_quote', 'request_deal_win', 'review_deal_win', 'request_contract_change', 'review_contract_change'] as const;
export type SalesAction = typeof SALES_ACTIONS[number];
export const SALES_HANDOFF_ACTIONS = ['request_sales_handoff','respond_sales_handoff','cancel_sales_handoff'] as const;
export type SalesHandoffAction = typeof SALES_HANDOFF_ACTIONS[number];
export type Action = CollectionAction|SalesAction|SalesHandoffAction|'create'|'create_prospect'|'import_prospects'|'update'|'delete'|'handoff'|'handoff_customer'|'log_contact'|'bulk_update_customers'|'import_customers'|'distribute_customers'|'transfer_to_telesales'|'log_telesales_call'|'resolve_issue'|'complete_project'|'reopen_project'|'review_content_publication'|'win_deal'|'update_settings'|'add_customer_note'|'update_customer_note'|'upsert_customer_action'|'complete_customer_action'|'cancel_customer_action';
export interface Command { action: Action; collection?: Collection; id?: string; data?: Record<string, unknown>; expectedRevision: number; requestId?: string }
export type AccessRole = 'owner'|'manager'|'account'|'telesales'|'delivery'|'finance';
export type StaffRole = Exclude<AccessRole,'owner'>;
export interface CRMIdentity { userId:string;email:string;displayName:string }
export interface AccessViewer { role:AccessRole;memberId?:string;name:string;email:string }
export interface AccessAccount { id:string;email:string;teamMemberId:string;role:StaffRole;active:boolean;bound:boolean;createdAt:string;updatedAt:string }
export interface AccessResponse { viewer:AccessViewer;owner:{email:string;name?:string};accounts?:AccessAccount[];revision?:number }
export interface AccessCommand { action:'upsert'|'set_status';id?:string;email?:string;teamMemberId?:string;newMember?:{name:string;jobTitle:string};role?:StaffRole;active?:boolean;expectedRevision:number }
export interface AccessContext extends AccessViewer { userId:string;ownerId:string;ownerEmail:string;ownerName?:string;accountId?:string;accountVersion?:number;controlRevision?:number }
export type WorkspaceScope = 'full'|'customers';
export interface CRMResponse { scope?: WorkspaceScope; salesAssignees?: {id:string;name:string}[]; salesHandoffs?: SalesHandoffRow[]; createdCustomerId?: string; createdCustomerIds?: string[]; telesalesAssignees?: {id:string;name:string}[]; projectAssignees?: {id:string;name:string}[]; data: Workspace; revision: number; mode: 'demo'|'live'; user: { name: string; email: string; role: string;memberId?:string } }
export const STAGES = ['Mới tiếp nhận', 'Đang tư vấn', 'Đã gửi báo giá', 'Đang thương lượng', 'Đã chốt', 'Không thành công'];
export const QUOTE_STAGES = new Set(['Đã gửi báo giá', 'Đang thương lượng']);
export const PROJECT_STATUSES = ['Đang triển khai', 'Chờ khách hàng', 'Tạm dừng', 'Hoàn tất'];
export const TASK_STATUSES = ['Cần làm', 'Đang làm', 'Hoàn tất'];
export const CONTENT_STATUSES = ['Ý tưởng', 'Đang sản xuất', 'Sẵn sàng đăng', 'Đã đăng'];
export const CUSTOMER_STATUSES = ['Mới', 'Đang liên hệ', 'Đang tư vấn', 'Đang hợp tác', 'Tạm ngừng', 'Không phù hợp'];
export const CONTACT_CHANNELS = ['Điện thoại','Telegram','Email','Gặp mặt','Khác'];
export const TELESALES_STATUSES = ['Chưa chuyển','Chờ gọi','Đang chăm sóc','Hẹn gọi lại','Đủ điều kiện','Đã bàn giao','Không phù hợp','Sai số'];
export const CALL_OUTCOMES = ['Không nghe máy','Máy bận','Hẹn gọi lại','Quan tâm','Đặt lịch tư vấn','Không phù hợp','Sai số'];

export const DEAL_PROBABILITIES: Record<string,number> = {'Mới tiếp nhận':10,'Đang tư vấn':30,'Đã gửi báo giá':60,'Đang thương lượng':80,'Đã chốt':100,'Không thành công':0};
