-- PostgreSQL schema. Run once using the migration runner; it owns the transaction.
-- ISO timestamp strings preserve the original CRM API/export format.
CREATE TABLE crm_workspaces (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  owner_email text NOT NULL,
  data text NOT NULL CHECK (octet_length(data) <= 1800000),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at text NOT NULL
);

CREATE TABLE crm_access_control (
  id text PRIMARY KEY CHECK (id = 'company'),
  owner_id text NOT NULL,
  owner_email text NOT NULL,
  owner_name text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  mutation_id text NOT NULL DEFAULT '',
  updated_at text NOT NULL
);

CREATE TABLE crm_access_accounts (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  team_member_id text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('manager', 'account', 'telesales')),
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  bound_user_id text UNIQUE,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX crm_access_accounts_active_role ON crm_access_accounts (role, active);

CREATE TABLE crm_access_audit (
  id text PRIMARY KEY,
  actor_id text NOT NULL,
  actor_email text NOT NULL,
  action text NOT NULL,
  target_id text NOT NULL,
  details text NOT NULL,
  at text NOT NULL
);
CREATE INDEX crm_access_audit_time ON crm_access_audit (at DESC);
