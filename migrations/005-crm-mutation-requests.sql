CREATE TABLE IF NOT EXISTS crm_mutation_requests (
  workspace_id text NOT NULL,
  actor_id text NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  created_customer_ids text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id, actor_id, request_id)
);
