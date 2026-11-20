import type { AccessContext, Command, Customer, Workspace } from './crm-types.js';
import { CRMError, prospectFields, requireProspectMember } from './crm-engine.js';
import { isCollectionAction } from './project-collections.js';

const staffRoles=new Set(['account','telesales']);
function denied():never{throw new CRMError('Bạn không có quyền thực hiện thao tác này.',403);}
export function canReadCustomer(customer:Customer,access:AccessContext):boolean{
  if(access.role==='owner' || access.role==='manager')return true;
  if(!access.memberId)return false;
  return access.role==='telesales'?customer.telesalesOwner===access.memberId:access.role==='account' && customer.owner===access.memberId;
}
const editableCustomerFields=new Set([...prospectFields,'jobTitle','address','website','background','favorite','tags','additionalPhones','additionalEmails','socialLinks']);
export function authorizeCommand(full:Workspace,command:Command,access:AccessContext):void{
  if(isCollectionAction(command.action) && access.role!=='owner')denied();
  if(access.role==='manager' && command.action==='update' && command.collection==='projects' && command.data && 'budget' in command.data) {
    const project=full.projects.find(record=>record.id===command.id);
    if(project?.ledger && command.data.budget !== project.budget)denied();
  }
  if(command.action==='create_prospect' || command.action==='import_prospects'){
    requireProspectMember(full,access);
    if(command.id!==undefined || command.collection!==undefined)denied();
    const keys=Object.keys(command.data || {});
    if(command.action==='create_prospect'?keys.some(key=>!prospectFields.has(key)):keys.some(key=>key!=='sourceFile' && key!=='rows'))denied();
    return;
  }
  if(access.role==='owner' || access.role==='manager')return;
  if(!staffRoles.has(access.role) || !access.memberId)denied();
  const customer=full.customers.find(row=>row.id===command.id);
  // A guessed or stale customer id is indistinguishable from an unauthorized one.
  if(!customer || !canReadCustomer(customer,access))denied();
  const data=command.data || {};
  if(command.action==='log_contact' || command.action==='add_customer_note')return;
  if(command.action==='log_telesales_call'){
    if(customer.telesalesOwner!==access.memberId)denied();return;
  }
  if(command.action==='update' && command.collection==='customers'){
    if(Object.keys(data).some(key=>!editableCustomerFields.has(key)))denied();return;
  }
  if(command.action==='upsert_customer_action'){
    if(data.owner!==access.memberId)denied();
    if(Object.prototype.hasOwnProperty.call(data,'actionId')){
      const action=customer.actions?.find(row=>row.id===data.actionId);
      if(!action || action.owner!==access.memberId)denied();
    }
    return;
  }
  if(command.action==='complete_customer_action' || command.action==='cancel_customer_action'){
    const action=customer.actions?.find(row=>row.id===data.actionId);
    if(!action || action.owner!==access.memberId)denied();return;
  }
  // Existing note authors are display names, not stable identities: staff edits stay denied.
  denied();
}

/** Last step for every read/write response; never use this projection as stored state. */
export function projectWorkspace(full:Workspace,access:AccessContext):Workspace{
  const result=structuredClone(full);
  if(access.role==='owner' || access.role==='manager')return result;
  if(!staffRoles.has(access.role) || !access.memberId)denied();
  result.customers=result.customers.filter(customer=>canReadCustomer(customer,access));
  const visibleIds=new Set(result.customers.map(customer=>customer.id));
  for(const customer of result.customers)customer.relationships=(customer.relationships || []).filter(relationship=>visibleIds.has(relationship.customerId));
  result.deals=result.deals.filter(deal=>visibleIds.has(deal.customerId)).map(deal=>{const safe={...deal};delete safe.projectId;return safe;});
  const serviceIds=new Set(result.deals.map(deal=>deal.serviceId));result.services=result.services.filter(service=>serviceIds.has(service.id));
  const entityIds=new Set([...visibleIds,...result.deals.map(deal=>deal.id)]);
  result.activities=result.activities.filter(activity=>activity.entityId && entityIds.has(activity.entityId)).map(activity=>{
    const safe={...activity};delete safe.details;return safe;
  });
  const memberIds=new Set<string>([access.memberId]);
  for(const customer of result.customers){memberIds.add(customer.owner);if(customer.telesalesOwner)memberIds.add(customer.telesalesOwner);for(const action of customer.actions || [])memberIds.add(action.owner);}
  for(const deal of result.deals)memberIds.add(deal.owner);
  result.team=result.team.filter(member=>memberIds.has(member.id) || memberIds.has(member.name)).map(member=>({...member,email:member.id===access.memberId?access.email:''}));
  result.projects=[];result.tasks=[];result.contents=[];result.issues=[];result.assets=[];result.changes=[];
  return result;
}

export type TelesalesRecipientAccount={id:string;team_member_id:string;role:string;active:number;version:number};
/** Access roles, not editable team labels, determine who can receive live telesales work. */
export function eligibleTelesalesAccounts(full:Workspace,accounts:TelesalesRecipientAccount[]):TelesalesRecipientAccount[]{
  const members=new Set(full.team.map(member=>member.id));
  return accounts.filter(account=>account.active===1 && account.role==='telesales' && members.has(account.team_member_id));
}
