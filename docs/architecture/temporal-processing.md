# Temporal processing boundary

Capture finalization, transcoding, transcription, observation extraction, procedure induction, document ingestion, evaluation, publication, exports, and integration retries belong to the `vision-codef-processing` Temporal task queue. Realtime frame handling and deviation decisions remain outside Temporal in the realtime service and deterministic procedure engine.

The API starts `captureProcessingWorkflow` with a company-scoped workflow ID:

`company:{company_id}:capture:{capture_session_id}`

Workflow inputs contain IDs, object keys, checksums, model/prompt versions, and other bounded metadata only. Video bytes, audio bytes, and large transcripts never enter Workflow inputs or history. Activities are idempotent by the capture idempotency key and use explicit non-retryable classifications for invalid or unsupported media references.

The workflow uses Temporal patch-based versioning and calls `continueAsNew` only when `workflowInfo().continueAsNewSuggested` is true. Company search attributes are opt-in until the corresponding Temporal visibility fields are registered; the company and capture IDs remain in workflow memo metadata in every configuration.

When Temporal or its worker is unavailable, the API reports a blocked/queued processing state. It does not manufacture a transcript, graph, or successful processing result.

The worker must deliver a signed POST to PROCESSING_COMPLETION_URL after the final activity. The API accepts it only with VISION_CODEF_PROCESSING_WEBHOOK_SECRET, verifies the canonical media object reference and unpublished graph, then records the transcript/observation/procedure artifact references and moves the workflow to Needs Review. Callback retries are idempotent.
