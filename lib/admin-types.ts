import type { AccessResponse, TeamMember } from './crm-types';

export interface AdminEvent {
  id: string;
  action: string;
  actor: string;
  subject: string;
  at: string;
}

export interface AdminDashboard {
  companyName: string;
  access: AccessResponse;
  team: TeamMember[];
  events: AdminEvent[];
}
