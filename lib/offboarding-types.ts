import type { AccessRole } from './crm-types';

export const handoverSections = {
  sales:'Khách hàng và cơ hội',
  telesales:'Hàng chờ Telesales',
  followUps:'Lịch chăm sóc ngoài nhóm đã giao',
  delivery:'Dự án và công việc triển khai',
  handoffs:'Đề nghị chuyển khách sẽ được hủy',
} as const;

export type HandoverSection = keyof typeof handoverSections;
export type HandoverRecipient = Exclude<HandoverSection,'handoffs'>;
export type HandoverChoice = {id:string;name:string;role:AccessRole};
export type HandoverPreview = {
  active:boolean;
  accessRevision:number;
  workspaceRevision:number;
  work:Record<HandoverSection,{count:number;examples:string[]}>;
  choices:Record<HandoverRecipient,HandoverChoice[]>;
};
