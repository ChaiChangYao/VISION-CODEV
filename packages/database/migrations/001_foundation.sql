CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION uuid_v7() RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  timestamp_ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
  bytes bytea := gen_random_bytes(16);
BEGIN
  bytes := set_byte(bytes, 0, ((timestamp_ms >> 40) & 255)::int);
  bytes := set_byte(bytes, 1, ((timestamp_ms >> 32) & 255)::int);
  bytes := set_byte(bytes, 2, ((timestamp_ms >> 24) & 255)::int);
  bytes := set_byte(bytes, 3, ((timestamp_ms >> 16) & 255)::int);
  bytes := set_byte(bytes, 4, ((timestamp_ms >> 8) & 255)::int);
  bytes := set_byte(bytes, 5, (timestamp_ms & 255)::int);
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 112);
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  RETURN encode(bytes, 'hex')::uuid;
END;
$$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE workflow_status AS ENUM ('draft', 'training', 'processing', 'approved', 'deployed', 'archived');
CREATE TYPE capture_state AS ENUM ('draft', 'preparing', 'active', 'paused', 'finalizing', 'processing', 'completed', 'failed');
CREATE TYPE media_asset_state AS ENUM ('pending', 'uploading', 'available', 'recovery_required', 'reconciled', 'failed', 'deleted');

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  company_id uuid NOT NULL REFERENCES companies(id),
  email text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, email)
);

CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  company_id uuid NOT NULL REFERENCES companies(id),
  created_by_member_id uuid NOT NULL,
  name text NOT NULL,
  family text NOT NULL CHECK (family IN ('golden_run', 'camera_automation', 'ambiguous')),
  status workflow_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, created_by_member_id) REFERENCES members(company_id, id)
);

CREATE TABLE IF NOT EXISTS capture_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  company_id uuid NOT NULL REFERENCES companies(id),
  workflow_id uuid NOT NULL,
  state capture_state NOT NULL DEFAULT 'draft',
  livekit_room text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, workflow_id) REFERENCES workflows(company_id, id),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  company_id uuid NOT NULL REFERENCES companies(id),
  capture_session_id uuid NOT NULL,
  state media_asset_state NOT NULL DEFAULT 'pending',
  object_key text NOT NULL,
  content_sha256 text,
  derived_from_asset_id uuid,
  duration_ms bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, object_key),
  FOREIGN KEY (company_id, capture_session_id) REFERENCES capture_sessions(company_id, id),
  FOREIGN KEY (company_id, derived_from_asset_id) REFERENCES media_assets(company_id, id)
);

CREATE TABLE IF NOT EXISTS observations (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  company_id uuid NOT NULL REFERENCES companies(id),
  capture_session_id uuid NOT NULL,
  media_time_ms bigint NOT NULL CHECK (media_time_ms >= 0),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance text NOT NULL CHECK (provenance IN ('EXPERT_ASSERTION', 'SENSOR_OBSERVATION', 'MODEL_INFERENCE', 'DOCUMENT_EVIDENCE', 'REVIEWER_CORRECTION', 'PUBLISHED_REQUIREMENT')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, capture_session_id) REFERENCES capture_sessions(company_id, id)
);

CREATE TABLE IF NOT EXISTS procedure_graphs (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  company_id uuid NOT NULL REFERENCES companies(id),
  workflow_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, workflow_id, version),
  FOREIGN KEY (company_id, workflow_id) REFERENCES workflows(company_id, id)
);

CREATE TABLE IF NOT EXISTS deployments (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  company_id uuid NOT NULL REFERENCES companies(id),
  workflow_id uuid NOT NULL,
  procedure_graph_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('ready', 'active', 'paused', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, workflow_id) REFERENCES workflows(company_id, id),
  FOREIGN KEY (company_id, procedure_graph_id) REFERENCES procedure_graphs(company_id, id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT uuid_v7(),
  company_id uuid NOT NULL REFERENCES companies(id),
  member_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, member_id) REFERENCES members(company_id, id)
);

CREATE INDEX IF NOT EXISTS workflows_company_updated_idx ON workflows(company_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS captures_company_created_idx ON capture_sessions(company_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS observations_company_session_time_idx ON observations(company_id, capture_session_id, media_time_ms);
CREATE INDEX IF NOT EXISTS audit_company_occurred_idx ON audit_events(company_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION app_company_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::uuid
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['companies', 'members', 'workflows', 'capture_sessions', 'media_assets', 'observations', 'procedure_graphs', 'deployments', 'audit_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id())', table_name);
  END LOOP;
END $$;
