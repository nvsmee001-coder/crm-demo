import type { PoolClient } from 'pg';
import { getReadAccess } from './access-store';
import { businessDate, CRMError, normalizeWorkspace, previewCustomerImport } from './crm-engine';
import type { CRMIdentity, Customer, Deal, Project, Workspace } from './crm-types';
import { CUSTOMER_STATUSES, TELESALES_STATUSES } from './crm-types';
import { withTransaction } from './database';
import { getWorkspaceRow, readCustomerWorkspace, type WorkspaceRow } from './workspace-tables';

const MAX_SELECTION=500;
export const CUSTOMER_PAGE_SIZE=25;
const priorities=['Cao','Trung bình','Thấp'];
const sortSql={
  followup:"COALESCE(NULLIF(followup,''),'9999'), name, position",
  priority:"CASE priority WHEN 'Cao' THEN 0 WHEN 'Trung bình' THEN 1 ELSE 2 END, name, position",
  recent:"COALESCE(NULLIF(payload->>'updatedAt',''),payload->>'createdAt','') DESC, position",
  name:'name, position',
};
const foldSql=(value:string)=>`lower(translate(regexp_replace(normalize(${value}, NFD), '[\u0300-\u036f]', '', 'g'), 'đĐ', 'dD'))`;
const dataset=`SELECT c.id,c.position,c.payload,c.owner_id,
  CASE c.payload->>'status' WHEN 'Tiềm năng' THEN 'Mới' WHEN 'Đang chăm sóc' THEN 'Đang liên hệ' WHEN 'Đã hoàn tất' THEN 'Tạm ngừng' ELSE c.payload->>'status' END AS status,
  COALESCE(NULLIF(c.payload->>'priority',''),'Trung bình') AS priority,
  COALESCE(NULLIF(c.payload->>'telesalesStatus',''),CASE WHEN c.telesales_id IS NULL THEN 'Chưa chuyển' ELSE 'Chờ gọi' END) AS tele,
  COALESCE(c.payload->>'nextFollowUp','') AS followup,
  ${foldSql("c.payload->>'name'")} AS name
  FROM crm_customers c WHERE c.workspace_id=$1`;
const activeSql="status NOT IN ('Tạm ngừng','Không phù hợp')";

function withDirectory<T>(identity:CRMIdentity,fn:(client:PoolClient,row:WorkspaceRow)=>Promise<T>) {
  return withTransaction(async client=>{
    const access=await getReadAccess(identity,client);
    if (access.role!=='owner'&&access.role!=='manager') throw new CRMError('Bạn không có quyền dùng danh sách quản lý khách hàng.',403);
    return fn(client,await getWorkspaceRow(client,'live',access,false));
  });
}

function customerQuery(workspaceId:string,params:URLSearchParams,ids?:string[]) {
  const bindings: (string|number|string[])[]=[workspaceId];
  const bind=(value:string|number|string[])=>'$'+bindings.push(value);
  const conditions:string[]=[];
  for (const [key,expression,allowed] of [
    ['status','status',CUSTOMER_STATUSES],['owner','owner_id',null],['source',"payload->>'source'",null],
    ['priority','priority',priorities],['tele','tele',TELESALES_STATUSES],
  ] as const) {
    const value=params.get(key);
    if (!value) continue;
    if (value.length>30000 || (allowed&&!allowed.includes(value))) throw new CRMError('Bộ lọc khách hàng không hợp lệ.');
    conditions.push(`${expression}=${bind(value)}`);
  }
  const tag=params.get('tag');
  if (tag) conditions.push(`(payload->'tags') ? ${bind(tag)}`);
  if (params.get('favorite')==='1') conditions.push("payload->'favorite'='true'::jsonb");
  const segment=params.get('segment') ?? 'all';
  switch (segment) {
    case 'all': break;
    case 'overdue': conditions.push(`${activeSql} AND followup<>'' AND followup<${bind(businessDate())}`); break;
    case 'today': conditions.push(`${activeSql} AND followup=${bind(businessDate())}`); break;
    case 'unscheduled': conditions.push(`${activeSql} AND followup=''`); break;
    default: throw new CRMError('Nhóm khách hàng không hợp lệ.');
  }
  const query=params.get('q')?.trim() ?? '';
  if (query.length>200) throw new CRMError('Từ khóa tối đa 200 ký tự.');
  if (query) {
    const needle=bind(query);
    const search=foldSql(`concat_ws(' ', payload->>'name',payload->>'contact',payload->>'phone',payload->>'email',payload->>'industry',
      payload->>'source',payload->>'notes',payload->>'jobTitle',payload->>'background',payload->>'tags',
      (SELECT string_agg(e->>'value',' ') FROM jsonb_array_elements(COALESCE(payload->'additionalPhones','[]')) e),
      (SELECT string_agg(e->>'value',' ') FROM jsonb_array_elements(COALESCE(payload->'additionalEmails','[]')) e),
      (SELECT t.payload->>'name' FROM crm_team t WHERE t.workspace_id=$1 AND (t.id=base.owner_id OR t.payload->>'name'=base.owner_id) ORDER BY (t.id=base.owner_id) DESC LIMIT 1))`);
    const stripped=query.replace(/[\s()+.-]/g,'');
    const phone=stripped.startsWith('0')?'84'+stripped.slice(1):stripped;
    const phoneMatch=/^\d{4,}$/.test(phone)?` OR (strpos(regexp_replace(COALESCE(payload->>'phone',''), '[^0-9]', '', 'g'),${bind(phone)})>0 OR
      EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(payload->'additionalPhones','[]')) p WHERE strpos(regexp_replace(p->>'value','[^0-9]','','g'),${bind(phone)})>0))`:'';
    conditions.push(`(strpos(${search},${foldSql(`${needle}::text`)})>0${phoneMatch})`);
  }
  if (ids) conditions.push(`id=ANY(${bind(ids)}::text[])`);
  const sort=params.get('sort') || 'followup';
  if (!Object.hasOwn(sortSql,sort)) throw new CRMError('Cách sắp xếp không hợp lệ.');
  const where=conditions.length?'WHERE '+conditions.map(condition=>`(${condition})`).join(' AND '):'';
  return {bindings,bind,sql:`WITH base AS (${dataset}), filtered AS (SELECT * FROM base ${where})`,order:sortSql[sort as keyof typeof sortSql]};
}

const lightPayload=`(payload - ARRAY['notes','background','avatarUrl','socialLinks','relationships','additionalPhones','additionalEmails','telesalesHandoffNote','interactions','notesLog','actions','salesHandoff']) || jsonb_build_object('status',status,'priority',priority,'telesalesStatus',tele)`;

export async function readCustomerDirectory(identity:CRMIdentity,params:URLSearchParams) {
  const requested=params.get('page') ?? '0';
  if (!/^\d{1,5}$/.test(requested)) throw new CRMError('Trang khách hàng không hợp lệ.');
  return withDirectory(identity,async (client,row)=>{
    const query=customerQuery(row.id,params);
    const requestedPage=query.bind(Number(requested));
    const {rows:[listing]}=await client.query<{customers:Customer[];total:number;page:number}>(`${query.sql},
      counts AS (SELECT count(*)::integer AS total FROM filtered),
      page_info AS (SELECT total, LEAST(${requestedPage}::integer,(GREATEST(total,1)-1)/${CUSTOMER_PAGE_SIZE}) AS page FROM counts)
      SELECT total,page,ARRAY(SELECT ${lightPayload} FROM filtered ORDER BY ${query.order} LIMIT ${CUSTOMER_PAGE_SIZE}
        OFFSET (SELECT page*${CUSTOMER_PAGE_SIZE} FROM page_info)) AS customers FROM page_info`,query.bindings);
    const {rows:[counts]}=await client.query<{all:number;overdue:number;today:number;unscheduled:number}>(`WITH base AS (${dataset})
      SELECT count(*)::integer AS all,count(*) FILTER (WHERE ${activeSql} AND followup<>'' AND followup<$2)::integer AS overdue,
        count(*) FILTER (WHERE ${activeSql} AND followup=$2)::integer AS today,
        count(*) FILTER (WHERE ${activeSql} AND followup='')::integer AS unscheduled FROM base`,[row.id,businessDate()]);
    const {rows:[facets]}=await client.query<{sources:string[];tags:string[]}>(`SELECT
      ARRAY(SELECT DISTINCT payload->>'source' FROM crm_customers WHERE workspace_id=$1 AND COALESCE(payload->>'source','')<>'') AS sources,
      ARRAY(SELECT DISTINCT tag FROM crm_customers CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(payload->'tags','[]')) tag WHERE workspace_id=$1) AS tags`,[row.id]);
    return {...listing,counts,sources:facets.sources.sort(),tags:facets.tags.sort(),revision:row.revision};
  });
}

export async function readCustomerSelection(identity:CRMIdentity,mode:unknown,filters:URLSearchParams,ids:unknown,revision:unknown) {
  if (mode!=='select'&&mode!=='export') throw new CRMError('Thao tác danh sách không hợp lệ.');
  if (ids!==undefined && (!Array.isArray(ids)||ids.length>MAX_SELECTION||ids.some(id=>typeof id!=='string'||!id||id.length>120))) throw new CRMError('Chọn tối đa 500 khách hàng hợp lệ.');
  return withDirectory(identity,async (client,row)=>{
    if (mode==='select' && ids===undefined && row.revision!==revision) throw new CRMError('Danh sách vừa thay đổi. Hãy kiểm tra lại bộ lọc trước khi chọn toàn bộ.',409);
    const query=customerQuery(row.id,filters,ids);
    const projection=mode==='export'?"payload || jsonb_build_object('status',status,'priority',priority,'telesalesStatus',tele)":lightPayload;
    const limit=mode==='select'?' LIMIT 501':'';
    const {rows}=await client.query<{customer:Customer}>(`${query.sql} SELECT ${projection} AS customer FROM filtered ORDER BY ${query.order}${limit}`,query.bindings);
    if (mode==='select'&&rows.length>MAX_SELECTION) throw new CRMError('Lọc còn tối đa 500 khách trước khi chọn toàn bộ.');
    return {customers:rows.map(item=>item.customer),revision:row.revision};
  });
}

export async function readCustomerProfile(identity:CRMIdentity,id:string) {
  if (!id || id.length>120) throw new CRMError('Mã khách hàng không hợp lệ.');
  return withDirectory(identity,async (client,row)=>{
    const data=await readCustomerWorkspace(client,row.id);
    const {rows:[profile]}=await client.query<{customer:Customer}>(`SELECT c.payload || jsonb_build_object(
      'interactions',COALESCE((SELECT jsonb_agg(payload ORDER BY position DESC) FROM crm_customer_interactions WHERE workspace_id=$1 AND parent_id=$2),'[]'),
      'notesLog',COALESCE((SELECT jsonb_agg(payload ORDER BY position DESC) FROM crm_customer_notes WHERE workspace_id=$1 AND parent_id=$2),'[]'),
      'actions',COALESCE((SELECT jsonb_agg(payload ORDER BY position DESC) FROM crm_customer_actions WHERE workspace_id=$1 AND parent_id=$2),'[]')
      ) AS customer FROM crm_customers c WHERE workspace_id=$1 AND id=$2`,[row.id,id]);
    if (!profile) throw new CRMError('Không tìm thấy hồ sơ khách hàng.',404);
    const {rows:related}=await client.query<{payload:Customer}>(`SELECT payload FROM crm_customers WHERE workspace_id=$1 AND id=ANY($2::text[])`,
      [row.id,(profile.customer.relationships ?? []).map(relationship=>relationship.customerId)]);
    data.customers=[profile.customer,...related.map(item=>item.payload)];
    data.deals=(await client.query<{payload:Deal}>(`SELECT d.payload || jsonb_build_object('stageHistory',COALESCE(
      (SELECT jsonb_agg(payload ORDER BY position) FROM crm_deal_stages WHERE workspace_id=$1 AND parent_id=d.id),'[]')) AS payload
      FROM crm_deals d WHERE workspace_id=$1 AND customer_id=$2 ORDER BY position`,[row.id,id])).rows.map(item=>item.payload);
    data.projects=(await client.query<{payload:Project}>(`SELECT payload FROM crm_projects WHERE workspace_id=$1 AND customer_id=$2 ORDER BY position`,[row.id,id])).rows.map(item=>item.payload);
    data.activities=(await client.query<{payload:Workspace['activities'][number]}>(`SELECT payload FROM crm_activities
      WHERE workspace_id=$1 AND payload->>'entityId'=ANY($2::text[]) ORDER BY position DESC`,[row.id,[id,...data.deals.map(deal=>deal.id),...data.projects.map(project=>project.id)]])).rows.map(item=>item.payload);
    return {data:normalizeWorkspace(data),revision:row.revision};
  });
}

export async function previewDirectoryImport(identity:CRMIdentity,rows:unknown,owner:unknown) {
  if (!Array.isArray(rows)||rows.length<1||rows.length>MAX_SELECTION||typeof owner!=='string') throw new CRMError('Chọn người phụ trách và từ 1 đến 500 dòng dữ liệu.');
  for (const [index,item] of rows.entries()) {
    if (!item||typeof item!=='object'||Array.isArray(item)||!Number.isInteger(item.rowNumber)||!item.data||typeof item.data!=='object'||Array.isArray(item.data)) throw new CRMError(`Dòng ${index+1} không hợp lệ.`);
  }
  return withDirectory(identity,async (client,row)=>{
    const data=await readCustomerWorkspace(client,row.id);
    data.customers=(await client.query<{customer:Customer}>(`SELECT jsonb_build_object('id',id,'name',payload->>'name',
      'phone',payload->>'phone','email',payload->>'email','additionalPhones',payload->'additionalPhones','additionalEmails',payload->'additionalEmails') AS customer
      FROM crm_customers WHERE workspace_id=$1`,[row.id])).rows.map(item=>item.customer);
    return {rows:previewCustomerImport(rows,data,owner),revision:row.revision};
  });
}
