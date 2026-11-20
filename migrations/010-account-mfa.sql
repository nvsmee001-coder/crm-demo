ALTER TABLE auth_users ADD COLUMN mfa_pending_enrollment boolean NOT NULL DEFAULT false;
ALTER TABLE auth_sessions ADD COLUMN mfa_setup_only boolean NOT NULL DEFAULT false;
ALTER TABLE auth_sessions ADD COLUMN mfa_verified boolean NOT NULL DEFAULT false;

CREATE TABLE auth_mfa_factors (
  user_id text PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  last_step bigint NOT NULL CHECK (last_step >= 0),
  enrolled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_mfa_recovery_codes (
  user_id text NOT NULL REFERENCES auth_mfa_factors(user_id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  PRIMARY KEY (user_id, code_hash)
);

CREATE TABLE auth_mfa_enrollments (
  user_id text PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  session_hash text NOT NULL REFERENCES auth_sessions(token_hash) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  expires_at timestamptz NOT NULL
);
