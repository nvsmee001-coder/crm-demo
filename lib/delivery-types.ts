import type { AccessViewer, Content, Issue, Project, Task } from './crm-types';

export type DeliveryProject = Pick<Project,'id'|'name'|'status'|'startDate'|'dueDate'|'scope'> & {customerName:string};
export type DeliveryTask = Pick<Task,'id'|'projectId'|'name'|'status'|'dueDate'|'hours'|'notes'|'deliveryResult'>;
export type DeliveryContent = Pick<Content,'id'|'projectId'|'title'|'status'|'publishDate'|'channel'|'batch'|'body'|'feedback'|'url'|'version'> & {
  publicationApproved?:boolean; publicationFeedback?:string;
};
export type DeliveryIssue = Pick<Issue,'id'|'projectId'|'title'|'description'|'status'|'dueDate'|'priority'|'resolution'>;

export interface DeliveryDashboard {
  companyName:string;
  contentApprovalRequired:boolean;
  viewer:Pick<AccessViewer,'name'|'email'>;
  revision:number;
  projects:DeliveryProject[];
  tasks:DeliveryTask[];
  contents:DeliveryContent[];
  issues:DeliveryIssue[];
}

export interface ProjectAssignment {
  revision:number;
  members:string[];
  candidates:{id:string;name:string;assignable:boolean}[];
}
