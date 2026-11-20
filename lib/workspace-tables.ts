import type { PoolClient } from 'pg';
import { CRMError } from './crm-engine';
import { createWorkspace } from './crm-seed';
import type { AccessContext, Collection, Workspace } from './crm-types';

export interface WorkspaceRow {
  id: string;
  owner_id: string;
  revision: number;
  updated_at: string;
}

// Table identifiers are fixed here, never taken from request input.
const collections = {
  team:'crm_team', customers:'crm_customers', services:'crm_services', projects:'crm_projects',
  deals:'crm_deals', tasks:'crm_tasks', contents:'crm_contents', changes:'crm_project_changes',
  issues:'crm_issues', assets:'crm_assets', activities:'crm_activities',
} as const;
type WorkspaceCollection = keyof typeof collections;
type Payload = Record<string, unknown>;
type RecordRow = {id:string; payload:Payload; parent_id?:string};
type NestedTable = {
  table: string;
  group: WorkspaceCollection | 'ledgers';
  field: string;
  order: 'asc' | 'desc';
  ordinal?: boolean;
};
const nestedTables: NestedTable[] = [
  {table:'crm_customer_interactions',group:'customers',field:'interactions',order:'desc'},
  {table:'crm_customer_notes',group:'customers',field:'notesLog',order:'desc'},
  {table:'crm_customer_actions',group:'customers',field:'actions',order:'desc'},
  {table:'crm_deal_stages',group:'deals',field:'stageHistory',order:'asc',ordinal:true},
  {table:'crm_content_versions',group:'contents',field:'history',order:'asc',ordinal:true},
  {table:'crm_project_receipts',group:'ledgers',field:'receipts',order:'desc'},
];
const readRowsSql = [
  ...Object.entries(collections).map(([group,table]) =>
    `SELECT '${group}' AS kind, id, NULL::text AS parent_id, ${group==='activities'?'-':''}position AS sort, payload FROM ${table} WHERE workspace_id=$1`),
  'SELECT \'ledgers\', id, NULL::text, 0::bigint, payload FROM crm_project_ledgers WHERE workspace_id=$1',
  ...nestedTables.map(({table,order}) =>
    `SELECT '${table}', id, parent_id, ${order==='desc'?'-':''}position, payload FROM ${table} WHERE workspace_id=$1`),
].join('\nUNION ALL\n')+'\nORDER BY kind, sort, id';

function findArchiveMismatch(): never {
  throw new CRMError('Dữ liệu nghiệp vụ chưa được chuyển đầy đủ. Liên hệ quản trị để kiểm tra migration.',503);
}

export function customerWorkspace(data: Pick<Workspace,'settings'|'team'|'services'>): Workspace {
  return {settings:data.settings,team:data.team,services:data.services,customers:[],deals:[],projects:[],tasks:[],contents:[],changes:[],issues:[],assets:[],activities:[]};
}

export async function readCustomerWorkspace(client: PoolClient, workspaceId: string) {
  const {rows:[row]}=await client.query<Pick<Workspace,'settings'|'team'|'services'>>(`
    SELECT payload->'settings' AS settings,
      COALESCE((SELECT jsonb_agg(payload ORDER BY position) FROM crm_team WHERE workspace_id=$1),'[]') AS team,
      COALESCE((SELECT jsonb_agg(payload ORDER BY position) FROM crm_services WHERE workspace_id=$1),'[]') AS services
    FROM crm_company_settings WHERE workspace_id=$1`,[workspaceId]);
  if (!row) findArchiveMismatch();
  return customerWorkspace(row);
}

export async function readWorkspaceRecords(client: PoolClient, workspaceId: string): Promise<Workspace> {
  const settings = (await client.query<{payload: Payload}>('SELECT payload FROM crm_company_settings WHERE workspace_id=$1',[workspaceId])).rows[0];
  if (!settings) findArchiveMismatch();
  const rows = (await client.query<RecordRow & {kind: string}>(readRowsSql,[workspaceId])).rows;
  const workspace: Payload = {...settings.payload};
  const byGroup = new Map<string, Map<string,Payload>>();
  for (const group of [...Object.keys(collections),'ledgers']) byGroup.set(group,new Map());
  for (const row of rows) {
    if (!row.parent_id) byGroup.get(row.kind)?.set(row.id,row.payload);
  }
  const specs = new Map(nestedTables.map(table=>[table.table,table]));
  for (const row of rows) {
    if (!row.parent_id) continue;
    const spec = specs.get(row.kind);
    if (!spec) findArchiveMismatch();
    const parent = byGroup.get(spec.group)?.get(row.parent_id);
    if (!parent) findArchiveMismatch();
    const children = (parent[spec.field] ??= []) as Payload[];
    children.push(row.payload);
  }
  for (const [id,ledger] of byGroup.get('ledgers')!) {
    const project = byGroup.get('projects')!.get(id);
    if (!project) findArchiveMismatch();
    project.ledger=ledger;
  }
  for (const group of Object.keys(collections)) workspace[group]=[...byGroup.get(group)!.values()];
  return workspace as unknown as Workspace;
}

function rowsFor(workspace: Workspace, group: WorkspaceCollection): Payload[] {
  return workspace[group] as unknown as Payload[];
}

function splitRow(payload: Payload, group: WorkspaceCollection | 'ledgers'): Payload {
  const row = {...payload};
  if (group === 'projects') delete row.ledger;
  for (const spec of nestedTables) {
    if (spec.group === group && Array.isArray(row[spec.field])) row[spec.field]=[];
  }
  return row;
}

function listRows(value: unknown): Payload[] {
  return Array.isArray(value) ? value : [];
}

function payloadId(payload: Payload): string {
  if (typeof payload.id !== 'string' || !payload.id) findArchiveMismatch();
  return payload.id;
}

async function putRows(client: PoolClient, workspaceId: string, table: string, rows: RecordRow[], revision: number, order: 'asc'|'desc', kind: 'top'|'nested'|'ledger') {
  if (!rows.length) return;
  // Preserve array order for multiple new rows and preserve the position of edits.
  const batch = JSON.stringify(order==='desc' ? [...rows].reverse() : rows);
  if (kind === 'ledger') {
    await client.query(`INSERT INTO crm_project_ledgers(workspace_id,id,payload)
      SELECT $1, item->>'id', item->'payload' FROM jsonb_array_elements($2::jsonb) item
      ON CONFLICT (workspace_id,id) DO UPDATE SET payload=EXCLUDED.payload`,[workspaceId,batch]);
    return;
  }
  if (kind === 'top') {
    await client.query(`INSERT INTO ${table}(workspace_id,id,last_revision,payload)
      SELECT $1, item->>'id', $3, item->'payload'
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS batch(item, ordinal) ORDER BY ordinal
      ON CONFLICT (workspace_id,id) DO UPDATE SET payload=EXCLUDED.payload,last_revision=EXCLUDED.last_revision`,[workspaceId,batch,revision]);
    return;
  }
  const receipts = table === 'crm_project_receipts';
  await client.query(`INSERT INTO ${table}(workspace_id,parent_id,id,payload${receipts?',receipt_date':''})
    SELECT $1, item->>'parent_id', item->>'id', item->'payload'${receipts?", (item->'payload'->>'date')::date":''}
    FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS batch(item, ordinal) ORDER BY ordinal
    ON CONFLICT (workspace_id,parent_id,id) DO UPDATE SET payload=EXCLUDED.payload${receipts?',receipt_date=EXCLUDED.receipt_date':''}`,[workspaceId,batch]);
}

async function writeRecords(client: PoolClient, workspaceId: string, before: Workspace | null, after: Workspace, revision: number) {
  if (!before || JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
    await client.query(`INSERT INTO crm_company_settings(workspace_id,payload,migrated_revision) VALUES ($1,$2,$3)
      ON CONFLICT (workspace_id) DO UPDATE SET payload=jsonb_set(crm_company_settings.payload,'{settings}',EXCLUDED.payload->'settings')`,
      [workspaceId,JSON.stringify({settings:after.settings}),revision]);
  }

  const ledgerEdits: RecordRow[] = [];
  const ledgerDeletes: string[] = [];
  const childEdits = new Map<string,RecordRow[]>();
  const childDeletes = new Map<string,RecordRow[]>();
  for (const {table} of nestedTables) {childEdits.set(table,[]);childDeletes.set(table,[]);}

  function diffChildren(spec: NestedTable, parentId: string, previous: Payload | undefined, next: Payload) {
    const idFor = (payload: Payload, index: number) => spec.ordinal ? String(index+1) : payloadId(payload);
    const oldRows = new Map(listRows(previous?.[spec.field]).map((item,index)=>[idFor(item,index),item]));
    for (const [index,item] of listRows(next[spec.field]).entries()) {
      const id = idFor(item,index);
      if (JSON.stringify(oldRows.get(id)) !== JSON.stringify(item)) childEdits.get(spec.table)!.push({id,parent_id:parentId,payload:item});
      oldRows.delete(id);
    }
    for (const [id,payload] of oldRows) childDeletes.get(spec.table)!.push({id,parent_id:parentId,payload});
  }

  const topDeletes: {table:string;ids:string[]}[] = [];
  for (const group of Object.keys(collections) as WorkspaceCollection[]) {
    const table = collections[group];
    const previousRows = new Map((before ? rowsFor(before,group) : []).map(row=>[payloadId(row),row]));
    const edits: RecordRow[] = [];
    for (const next of rowsFor(after,group)) {
      const id = payloadId(next);
      const previous = previousRows.get(id);
      previousRows.delete(id);
      if (JSON.stringify(previous) === JSON.stringify(next)) continue;
      edits.push({id,payload:splitRow(next,group)});
      for (const spec of nestedTables) {
        if (spec.group === group) diffChildren(spec,id,previous,next);
      }
      if (group !== 'projects') continue;
      const oldLedger = previous?.ledger as Payload | undefined;
      const ledger = next.ledger as Payload | undefined;
      if (oldLedger && !ledger) ledgerDeletes.push(id);
      if (!ledger || JSON.stringify(oldLedger) === JSON.stringify(ledger)) continue;
      ledgerEdits.push({id,payload:splitRow(ledger,'ledgers')});
      diffChildren(nestedTables.find(spec=>spec.group==='ledgers')!,id,oldLedger,ledger);
    }
    await putRows(client,workspaceId,table,edits,revision,group==='activities'?'desc':'asc','top');
    if (previousRows.size) topDeletes.push({table,ids:[...previousRows.keys()]});
  }

  await putRows(client,workspaceId,'crm_project_ledgers',ledgerEdits,revision,'asc','ledger');
  for (const spec of nestedTables) {
    const removed = childDeletes.get(spec.table)!;
    if (removed.length) await client.query(`DELETE FROM ${spec.table} row USING jsonb_array_elements($2::jsonb) item
      WHERE row.workspace_id=$1 AND row.parent_id=item->>'parent_id' AND row.id=item->>'id'`,[workspaceId,JSON.stringify(removed)]);
    await putRows(client,workspaceId,spec.table,childEdits.get(spec.table)!,revision,spec.order,'nested');
  }
  if (ledgerDeletes.length) await client.query('DELETE FROM crm_project_ledgers WHERE workspace_id=$1 AND id=ANY($2::text[])',[workspaceId,ledgerDeletes]);
  for (const {table, ids} of topDeletes) await client.query(`DELETE FROM ${table} WHERE workspace_id=$1 AND id=ANY($2::text[])`,[workspaceId,ids]);
}

export async function getWorkspaceRow(client: PoolClient, mode: 'live'|'demo', access: AccessContext, lock: boolean): Promise<WorkspaceRow> {
  const id = 'smee:'+mode;
  const select = 'SELECT id,owner_id,revision,updated_at FROM crm_workspaces WHERE id=$1' + (lock ? ' FOR UPDATE' : '');
  let row = (await client.query<WorkspaceRow>(select,[id])).rows[0];
  if (!row) {
    if (access.role !== 'owner') throw new CRMError('Không gian làm việc chưa được chủ sở hữu khởi tạo.',403);
    const created = await client.query<WorkspaceRow>(`INSERT INTO crm_workspaces(id,owner_id,owner_email,data,revision,updated_at)
      VALUES ($1,$2,$3,'{}',0,$4) ON CONFLICT (id) DO NOTHING RETURNING id,owner_id,revision,updated_at`,
      [id,access.ownerId,access.ownerEmail,new Date().toISOString()]);
    row = created.rows[0];
    if (row) await writeRecords(client,id,null,createWorkspace(mode),0);
    else row = (await client.query<WorkspaceRow>(select,[id])).rows[0];
  }
  if (!row || row.owner_id !== access.ownerId) throw new CRMError('Không thể mở không gian làm việc của công ty.',403);
  return row;
}

export async function saveWorkspaceRecords(client: PoolClient, row: WorkspaceRow, before: Workspace, after: Workspace): Promise<number> {
  const revision = row.revision+1;
  const updated = await client.query('UPDATE crm_workspaces SET revision=$1,updated_at=$2 WHERE id=$3 AND revision=$4 AND owner_id=$5',
    [revision,new Date().toISOString(),row.id,row.revision,row.owner_id]);
  if (updated.rowCount !== 1) throw new CRMError('Dữ liệu vừa thay đổi. Hãy đối chiếu trước khi lưu.',409);
  await writeRecords(client,row.id,before,after,revision);
  return revision;
}

export async function recordUnchangedSince(client: PoolClient, workspaceId: string, collection: Collection, id: string, revision: number): Promise<boolean> {
  if (!Object.hasOwn(collections,collection)) return false;
  const row = (await client.query<{last_revision:number}>(`SELECT last_revision FROM ${collections[collection]} WHERE workspace_id=$1 AND id=$2`,[workspaceId,id])).rows[0];
  return !!row && row.last_revision<=revision;
}
