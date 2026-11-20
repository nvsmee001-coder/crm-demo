import type { AccessViewer, Contract, Customer, Project } from './crm-types';

export type CollectionsProject = Pick<Project,'id'|'name'|'customerId'|'budget'|'ledger'> & {
  contract?:Pick<Contract,'number'|'source'> & {signedOn?:string;confirmed?:{name:string};evidence?:string};
  scope?:string; status?:string; legacyContractChanges?:Project['legacyContractChanges'];
};
export interface CollectionsData { projects:CollectionsProject[]; customers:Pick<Customer,'id'|'name'>[] }
export interface FinanceDashboard { data:CollectionsData; revision:number; viewer:Pick<AccessViewer,'name'|'email'> }
