import { getReadAccess } from './access-store';
import { CRMError } from './crm-engine';
import { CUSTOMER_STATUSES, type CRMIdentity, type Customer } from './crm-types';
import { withTransaction } from './database';
import { getWorkspaceRow } from './workspace-tables';

type Summary = Pick<Customer,'id'|'name'|'contact'|'email'|'phone'|'owner'|'status'|'industry'> & {
  nextFollowUp: string | null;
  telesalesStatus: NonNullable<Customer['telesalesStatus']> | null;
};

export async function listCustomers(identity: CRMIdentity, params: URLSearchParams) {
  const mode=params.get('mode');
  if (mode!==null && mode!=='live') throw new CRMError('Danh sách này chỉ phục vụ dữ liệu công ty.',403);
  const query=(params.get('q') ?? '').trim();
  const limitText=params.get('limit') ?? '25';
  const after=params.get('after') ?? '0';
  const status=params.get('status') ?? '';
  if (query.length>200 || !/^\d{1,3}$/.test(limitText) || Number(limitText)<1 || Number(limitText)>100 ||
      !/^\d{1,18}$/.test(after) || (status && !CUSTOMER_STATUSES.includes(status))) {
    throw new CRMError('Bộ lọc hoặc trang khách hàng không hợp lệ.');
  }
  const limit=Number(limitText);
  return withTransaction(async client=>{
    const access=await getReadAccess(identity,client);
    const workspace=await getWorkspaceRow(client,'live',access,false);
    const bindings: (string|number)[]=[workspace.id,after];
    const filters=['workspace_id=$1','position>$2::bigint'];
    function bind(value:string|number) { return '$'+bindings.push(value); }
    if (access.role==='account' || access.role==='telesales') {
      if (!access.memberId) throw new CRMError('Tài khoản chưa liên kết nhân sự.',403);
      const column=access.role==='account'?'owner_id':'telesales_id';
      filters.push(`${column}=${bind(access.memberId)}`);
    } else if (access.role!=='owner' && access.role!=='manager') throw new CRMError('Bạn không có quyền đọc danh sách khách hàng.',403);
    if (status) filters.push(`payload->>'status'=${bind(status)}`);
    if (query) filters.push(`strpos(lower(concat_ws(' ',payload->>'name',payload->>'contact',payload->>'phone',payload->>'email')),lower(${bind(query)}))>0`);
    const {rows}=await client.query<{cursor:string;customer:Summary}>(`
      SELECT position::text AS cursor, jsonb_build_object(
        'id',id, 'name',payload->>'name', 'contact',payload->>'contact', 'email',payload->>'email',
        'phone',payload->>'phone', 'owner',owner_id, 'status',payload->>'status', 'industry',payload->>'industry',
        'nextFollowUp',payload->>'nextFollowUp', 'telesalesStatus',payload->>'telesalesStatus'
      ) AS customer
      FROM crm_customers WHERE ${filters.join(' AND ')} ORDER BY position LIMIT ${bind(limit+1)}`,bindings);
    const page=rows.slice(0,limit);
    return {customers:page.map(row=>row.customer),nextCursor:rows.length>limit?page.at(-1)!.cursor:null,revision:workspace.revision};
  });
}
