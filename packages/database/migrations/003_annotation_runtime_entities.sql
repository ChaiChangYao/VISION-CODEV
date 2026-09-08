ALTER TABLE api_runtime_state
  DROP CONSTRAINT IF EXISTS api_runtime_state_entity_type_check;

ALTER TABLE api_runtime_state
  ADD CONSTRAINT api_runtime_state_entity_type_check
  CHECK (entity_type IN ('workflow', 'capture', 'media_asset', 'deployment', 'annotation', 'reference_pack', 'event'));
