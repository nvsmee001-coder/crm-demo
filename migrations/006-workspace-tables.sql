-- Split operational records from the archived JSON snapshot. The migration runner
-- applies the schema and backfill in one transaction.
LOCK TABLE crm_workspaces IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE crm_record_position_seq START WITH 1000000;

CREATE TABLE crm_company_settings (
  workspace_id text PRIMARY KEY REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (jsonb_typeof(payload->'settings') = 'object') IS TRUE),
  migrated_revision integer NOT NULL CHECK (migrated_revision >= 0)
);

CREATE TABLE crm_team (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX crm_team_position ON crm_team(workspace_id, position);

CREATE TABLE crm_customers (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  owner_id text GENERATED ALWAYS AS (payload->>'owner') STORED NOT NULL,
  telesales_id text GENERATED ALWAYS AS (NULLIF(payload->>'telesalesOwner', '')) STORED,
  PRIMARY KEY (workspace_id, id)
);
CREATE UNIQUE INDEX crm_customers_position ON crm_customers(workspace_id, position);

CREATE TABLE crm_services (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX crm_services_position ON crm_services(workspace_id, position);

CREATE TABLE crm_projects (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  customer_id text GENERATED ALWAYS AS (NULLIF(payload->>'customerId', '')) STORED NOT NULL,
  service_id text GENERATED ALWAYS AS (NULLIF(payload->>'serviceId', '')) STORED NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, customer_id) REFERENCES crm_customers(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, service_id) REFERENCES crm_services(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX crm_projects_position ON crm_projects(workspace_id, position);
CREATE INDEX crm_projects_customer_id ON crm_projects(workspace_id, customer_id);
CREATE INDEX crm_projects_service_id ON crm_projects(workspace_id, service_id);

CREATE TABLE crm_deals (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  customer_id text GENERATED ALWAYS AS (NULLIF(payload->>'customerId', '')) STORED NOT NULL,
  service_id text GENERATED ALWAYS AS (NULLIF(payload->>'serviceId', '')) STORED NOT NULL,
  project_id text GENERATED ALWAYS AS (NULLIF(payload->>'projectId', '')) STORED,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, customer_id) REFERENCES crm_customers(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, service_id) REFERENCES crm_services(workspace_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (workspace_id, project_id) REFERENCES crm_projects(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX crm_deals_position ON crm_deals(workspace_id, position);
CREATE INDEX crm_deals_customer_id ON crm_deals(workspace_id, customer_id);
CREATE INDEX crm_deals_service_id ON crm_deals(workspace_id, service_id);
CREATE INDEX crm_deals_project_id ON crm_deals(workspace_id, project_id);

CREATE TABLE crm_tasks (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  project_id text GENERATED ALWAYS AS (NULLIF(payload->>'projectId', '')) STORED NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES crm_projects(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX crm_tasks_position ON crm_tasks(workspace_id, position);
CREATE INDEX crm_tasks_project_id ON crm_tasks(workspace_id, project_id);

CREATE TABLE crm_contents (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  project_id text GENERATED ALWAYS AS (NULLIF(payload->>'projectId', '')) STORED NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES crm_projects(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX crm_contents_position ON crm_contents(workspace_id, position);
CREATE INDEX crm_contents_project_id ON crm_contents(workspace_id, project_id);

CREATE TABLE crm_project_changes (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  project_id text GENERATED ALWAYS AS (NULLIF(payload->>'projectId', '')) STORED NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES crm_projects(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX crm_project_changes_position ON crm_project_changes(workspace_id, position);
CREATE INDEX crm_project_changes_project_id ON crm_project_changes(workspace_id, project_id);

CREATE TABLE crm_issues (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  project_id text GENERATED ALWAYS AS (NULLIF(payload->>'projectId', '')) STORED NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES crm_projects(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX crm_issues_position ON crm_issues(workspace_id, position);
CREATE INDEX crm_issues_project_id ON crm_issues(workspace_id, project_id);

CREATE TABLE crm_assets (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  service_id text GENERATED ALWAYS AS (NULLIF(payload->>'serviceId', '')) STORED,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, service_id) REFERENCES crm_services(workspace_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX crm_assets_position ON crm_assets(workspace_id, position);
CREATE INDEX crm_assets_service_id ON crm_assets(workspace_id, service_id);

CREATE TABLE crm_activities (
  workspace_id text NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  last_revision integer NOT NULL CHECK (last_revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX crm_activities_position ON crm_activities(workspace_id, position);
CREATE INDEX crm_customers_owner ON crm_customers(workspace_id, owner_id, position);
CREATE INDEX crm_customers_telesales ON crm_customers(workspace_id, telesales_id, position);

CREATE TABLE crm_project_ledgers (
  workspace_id text NOT NULL,
  id text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, id) REFERENCES crm_projects(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE crm_customer_interactions (
  workspace_id text NOT NULL,
  parent_id text NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  PRIMARY KEY (workspace_id, parent_id, id),
  FOREIGN KEY (workspace_id, parent_id) REFERENCES crm_customers(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX crm_customer_interactions_position ON crm_customer_interactions(workspace_id, parent_id, position);

CREATE TABLE crm_customer_notes (
  workspace_id text NOT NULL,
  parent_id text NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  PRIMARY KEY (workspace_id, parent_id, id),
  FOREIGN KEY (workspace_id, parent_id) REFERENCES crm_customers(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX crm_customer_notes_position ON crm_customer_notes(workspace_id, parent_id, position);

CREATE TABLE crm_customer_actions (
  workspace_id text NOT NULL,
  parent_id text NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  PRIMARY KEY (workspace_id, parent_id, id),
  FOREIGN KEY (workspace_id, parent_id) REFERENCES crm_customers(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX crm_customer_actions_position ON crm_customer_actions(workspace_id, parent_id, position);

CREATE TABLE crm_deal_stages (
  workspace_id text NOT NULL,
  parent_id text NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (workspace_id, parent_id, id),
  FOREIGN KEY (workspace_id, parent_id) REFERENCES crm_deals(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX crm_deal_stages_position ON crm_deal_stages(workspace_id, parent_id, position);

CREATE TABLE crm_content_versions (
  workspace_id text NOT NULL,
  parent_id text NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (workspace_id, parent_id, id),
  FOREIGN KEY (workspace_id, parent_id) REFERENCES crm_contents(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX crm_content_versions_position ON crm_content_versions(workspace_id, parent_id, position);

CREATE TABLE crm_project_receipts (
  workspace_id text NOT NULL,
  parent_id text NOT NULL,
  id text NOT NULL CHECK (id <> ''),
  position bigint NOT NULL DEFAULT nextval('crm_record_position_seq'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'id' = id) IS TRUE),
  amount bigint GENERATED ALWAYS AS ((payload->>'amount')::bigint) STORED NOT NULL CHECK (amount >= 0 AND amount <= 1000000000000),
  receipt_date date NOT NULL,
  PRIMARY KEY (workspace_id, parent_id, id),
  FOREIGN KEY (workspace_id, parent_id) REFERENCES crm_project_ledgers(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX crm_project_receipts_position ON crm_project_receipts(workspace_id, parent_id, position);

-- Optional legacy arrays may be absent. Present arrays must be well formed.
INSERT INTO crm_company_settings(workspace_id, payload, migrated_revision)
SELECT id, data::jsonb - ARRAY['team', 'customers', 'services', 'projects', 'deals', 'tasks', 'contents', 'changes', 'issues', 'assets', 'activities'], revision
FROM crm_workspaces;

INSERT INTO crm_team(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'team') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_customers(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, jsonb_set(jsonb_set(jsonb_set(item.value, '{interactions}', '[]', false), '{notesLog}', '[]', false), '{actions}', '[]', false)
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'customers') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_services(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'services') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_projects(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, item.value - 'ledger'
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'projects') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_deals(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, jsonb_set(item.value, '{stageHistory}', '[]', false)
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'deals') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_tasks(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'tasks') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_contents(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, jsonb_set(item.value, '{history}', '[]', false)
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'contents') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_project_changes(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'changes') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_issues(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'issues') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_assets(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', item.ordinality, w.revision, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'assets') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_activities(workspace_id, id, position, last_revision, payload)
SELECT w.id, item.value->>'id', -item.ordinality, w.revision, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'activities') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_project_ledgers(workspace_id, id, payload)
SELECT w.id, record.value->>'id', jsonb_set(record.value->'ledger', '{receipts}', '[]', false)
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'projects') AS record(value)
WHERE record.value ? 'ledger';

INSERT INTO crm_customer_interactions(workspace_id, parent_id, id, position, payload)
SELECT w.id, record.value->>'id', item.value->>'id', -item.ordinality, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'customers') AS record(value)
CROSS JOIN LATERAL jsonb_array_elements(record.value->'interactions') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_customer_notes(workspace_id, parent_id, id, position, payload)
SELECT w.id, record.value->>'id', item.value->>'id', -item.ordinality, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'customers') AS record(value)
CROSS JOIN LATERAL jsonb_array_elements(record.value->'notesLog') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_customer_actions(workspace_id, parent_id, id, position, payload)
SELECT w.id, record.value->>'id', item.value->>'id', -item.ordinality, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'customers') AS record(value)
CROSS JOIN LATERAL jsonb_array_elements(record.value->'actions') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_deal_stages(workspace_id, parent_id, id, position, payload)
SELECT w.id, record.value->>'id', item.ordinality::text, item.ordinality, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'deals') AS record(value)
CROSS JOIN LATERAL jsonb_array_elements(record.value->'stageHistory') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_content_versions(workspace_id, parent_id, id, position, payload)
SELECT w.id, record.value->>'id', item.ordinality::text, item.ordinality, item.value
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'contents') AS record(value)
CROSS JOIN LATERAL jsonb_array_elements(record.value->'history') WITH ORDINALITY AS item(value, ordinality);

INSERT INTO crm_project_receipts(workspace_id, parent_id, id, position, payload, receipt_date)
SELECT w.id, record.value->>'id', item.value->>'id', -item.ordinality, item.value, (item.value->>'date')::date
FROM crm_workspaces w
CROSS JOIN LATERAL jsonb_array_elements(w.data::jsonb->'projects') AS record(value)
CROSS JOIN LATERAL jsonb_array_elements(record.value->'ledger'->'receipts') WITH ORDINALITY AS item(value, ordinality);

CREATE FUNCTION crm_keep_legacy_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Archived CRM snapshot is read-only after migration 006';
END;
$$;
CREATE TRIGGER crm_legacy_snapshot_read_only
  BEFORE UPDATE OF data ON crm_workspaces
  FOR EACH ROW EXECUTE FUNCTION crm_keep_legacy_snapshot();
