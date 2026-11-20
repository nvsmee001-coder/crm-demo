import type { AccessResponse, TeamMember } from './crm-types';

export interface AdminEvent {
  id: string;
  action: string;
  actor: string;
  subject: string;
  at: string;
  reason?: string;
}

export interface AdminDashboard {
  companyName: string;
  access: AccessResponse;
  team: TeamMember[];
  events: AdminEvent[];
  mfa: {available:boolean;ownerEnabled:boolean;required:boolean;enabledAccountIds:string[];pendingAccountIds:string[]};
}
