CREATE TABLE IF NOT EXISTS api_runtime_state (
  company_id uuid NOT NULL REFERENCES companies(id),
  entity_type text NOT NULL CHECK (entity_type IN ('workflow', 'capture', 'media_asset', 'deployment', 'event')),
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS api_runtime_state_company_type_idx
  ON api_runtime_state(company_id, entity_type, updated_at DESC);

ALTER TABLE api_runtime_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_runtime_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON api_runtime_state;
CREATE POLICY tenant_isolation ON api_runtime_state
  USING (company_id = app_company_id())
  WITH CHECK (company_id = app_company_id());
