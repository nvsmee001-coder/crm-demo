/** SQL migrations in migrations/ are the authoritative PostgreSQL schema. */
export const CRM_TABLES = [
  'crm_workspaces',
  'crm_access_control',
  'crm_access_accounts',
  'crm_access_audit',
] as const;
