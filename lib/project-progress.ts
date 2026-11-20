import type { Content, Project, ProjectOpenWork, Workspace } from './crm-types.js';

export type AccountProjectProgress = Pick<Project,'id'|'name'|'status'|'dueDate'> & {
  tasksTotal:number; open:ProjectOpenWork; acceptedAt?:string;
};

export function projectOpenWork(workspace: Workspace, projectId: string):ProjectOpenWork {
  return {
    tasks:workspace.tasks.filter(item=>item.projectId===projectId && item.status!=='Hoàn tất').length,
    contents:workspace.contents.filter(item=>item.projectId===projectId && item.status!=='Đã đăng').length,
    issues:workspace.issues.filter(item=>item.projectId===projectId && !['Đã giải quyết','Đã xử lý'].includes(item.status)).length,
  };
}

export function hasPublicationApproval(content: Pick<Content,'version'|'approvedVersion'|'approvedAt'|'approvalConfirmation'>) {
  return content.approvedVersion === content.version && Boolean(content.approvedAt && content.approvalConfirmation?.trim());
}
