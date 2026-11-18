CREATE TABLE IF NOT EXISTS crm_files (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  uploaded_by text NOT NULL,
  name text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_files_owner_idx ON crm_files(owner_id);
