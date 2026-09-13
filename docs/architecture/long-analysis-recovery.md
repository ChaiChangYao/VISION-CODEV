# Long analysis recovery — September 11, 2026

## Failure and fix

The 573,464,366-byte recording uploaded and transcribed successfully. Each extractObservations activity then failed after approximately 307 seconds with UND_ERR_HEADERS_TIMEOUT, despite a 55-minute AbortSignal deadline. Five activity attempts exhausted the workflow while the provider continued checkpointing work.

The worker now requests observations with Prefer: respond-async. The OpenAI-backed provider starts or joins the existing per-capture job and returns HTTP 202 promptly. The worker consumes that response and polls every two seconds, keeping heartbeats and progress reporting active. Observation polls have individual 30-second deadlines and an overall 55-minute deadline. Failures surface to the existing bounded retry policy, rather than interpreting acceptance as completion. Finished observation artifacts are reused; missing artifacts resume validated per-window checkpoints after provider restart.

This change covers the failing OpenAI observations stage. Finalize/transcribe and the legacy Ollama path retain their existing request behavior. This is not a new independent durable job queue: Temporal owns retries, artifacts/checkpoints are on disk, and the provider's in-flight map is in memory.

## Verified same-video result

- Workflow: 01a08fa4-59e9-7a17-aa34-3ced0cbc9564 (Learn how to use a 3D printer).
- Capture: 01a08fb0-e86f-74f6-b08d-a1486b4f5b75. No re-upload or replacement recording.
- Retry submitted 09:36:31 UTC; completed 09:41:56 UTC (about 5m25s, beyond the former connection ceiling).
- Live asynchronous response measured HTTP 202 in 90ms at 57/64 windows.
- Completion API: completed, 100%, Procedure graph draft is ready.
- Graph: 296366ab-00bc-4731-b385-9b3ca3e52caa, 64/64 windows, 125 candidate actions, 255310ms duration. Media SHA-256 matches the upload.
- Browser review page loaded the 125-action draft and original video. Play/pause advanced to 15.86s of 4:15.31; screenshot inspected. No actions reviewed or published.
- Budget ledger accounted $0.747089 total across 102 entries, including previous runs and uncertain-request reservations. Existing $10 cap unchanged. Not a provider billing statement.

## Tests / operations

- Worker suite passed 11 tests, then added a seventh provider-boundary test simulating six minutes of polling; all 7 provider tests passed (12 worker tests total).
- Local-processing suite passed 10 tests. Both builds and final typechecks passed.
- Regression coverage: 202 -> 202 -> artifact, background failure propagation, heartbeats, cleanup, and polling past five minutes.
- Restarted only worker and local-processing provider. Existing upload-limit changes preserved.
- Restart interrupted an in-flight provider request; its full reservation remains charged in the ledger. After confirming the old process had stopped, its empty lock was moved to senior-api-budget.json.lock.stale-20260911-1736. No ledger entries or completed checkpoints were removed.
- Prettier command was unavailable in this workspace invocation; git diff --check passed.

Review URL: http://localhost:3000/workflows/01a08fa4-59e9-7a17-aa34-3ced0cbc9564/approve
