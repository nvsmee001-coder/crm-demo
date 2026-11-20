ALTER TABLE crm_access_accounts DROP CONSTRAINT crm_access_accounts_role_check;
ALTER TABLE crm_access_accounts ADD CONSTRAINT crm_access_accounts_role_check
  CHECK (role IN ('manager', 'account', 'telesales', 'delivery', 'finance'));
