# Processing worker

The worker is the Temporal boundary for capture finalization, transcription,
observation extraction, and procedure induction. It sends bounded object
references and pinned metadata to the configured processing provider; media
bytes and large transcripts never enter Workflow inputs or history.

Start it only after configuring all of these values:

- `TEMPORAL_ADDRESS`
- `PROCESSING_COMPLETION_URL`
- `VISION_CODEF_PROCESSING_WEBHOOK_SECRET`
- `VISION_CODEF_PROCESSING_PROVIDER_URL`

If the provider or completion sink is missing, the worker exits with an
actionable error. The API keeps the capture processing gate blocked; it does
not manufacture a transcript or procedure graph.
