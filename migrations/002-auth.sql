CREATE TABLE auth_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name text NOT NULL,
  password_hash text NOT NULL,
  credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  credential_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE TABLE auth_setup_tokens (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  crm_account_id text NOT NULL REFERENCES crm_access_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_setup_tokens_account_idx ON auth_setup_tokens(crm_account_id);
CREATE INDEX auth_setup_tokens_expiry_idx ON auth_setup_tokens(expires_at);
CREATE TABLE auth_security_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL,
  user_id text,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_security_events_created_idx ON auth_security_events(created_at);
