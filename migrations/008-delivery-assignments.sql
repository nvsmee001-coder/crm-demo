ALTER TABLE crm_access_accounts DROP CONSTRAINT crm_access_accounts_role_check;
ALTER TABLE crm_access_accounts ADD CONSTRAINT crm_access_accounts_role_check
  CHECK (role IN ('manager', 'account', 'telesales', 'delivery'));

CREATE TABLE crm_project_members (
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  member_id text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by text NOT NULL,
  PRIMARY KEY (workspace_id, project_id, member_id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES crm_projects(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, member_id) REFERENCES crm_team(workspace_id, id)
);

CREATE INDEX crm_project_members_member ON crm_project_members(workspace_id, member_id, project_id);
CREATE INDEX crm_delivery_project_owner ON crm_projects(workspace_id, (payload->>'owner'));
CREATE INDEX crm_delivery_task_owner ON crm_tasks(workspace_id, (payload->>'owner'));
CREATE INDEX crm_delivery_content_owner ON crm_contents(workspace_id, (payload->>'owner'));
CREATE INDEX crm_delivery_issue_owner ON crm_issues(workspace_id, (payload->>'owner'));
