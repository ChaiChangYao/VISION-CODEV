# Senior Golden Run implementation plan

Approved scope: senior capture or MP4 import, detailed draft, simple self-review, explicit publication. Junior guidance and hand pose are excluded. API evaluation budget: USD 10 total, not per recording. Reference annotation videos must never be sent as analysis input.

## Milestones

1. Full temporal coverage: overlapping bounded windows, timestamped frames, multiple atomic actions, before/after states and uncertainty; retain provider/model/prompt provenance. Save each successful window so retries resume. Never silently truncate a recording or declare incomplete analysis ready.
2. Simple review: video plus action list, editable description/timing/completion check/reasoning/reference, add/split/merge/remove, saved draft and explicit reviewed confirmation. Preserve published versions and original evidence.
3. Verification: unit/contract/regression tests, silent-source evaluation on four supplied samples, reference-only quality comparison, UI and API smoke checks. Record actual spend, latency and limitations; do not claim production accuracy from four clips.

## Guardrails

- Retain unrelated existing files and changes.
- Use existing OpenAI integration, keeping provider replaceable; no API keys in logs or browser.
- Paid tests reserve a conservative maximum before each request in a persistent ledger, including uncertain failures. No unbounded retries or automatic model escalation.
- Use stage and window counts, not elapsed-time guesses, for progress.
- New review fields are optional for legacy graphs; new drafts require explicit review before publication.
- Completion checks are reviewer-approved assertions, not proof from a model. Hidden outcomes remain uncertain.

## Acceptance

- Sampling covers the full input and preserves concurrent actions without global event caps.
- Re-running after a failure reuses completed windows.
- All review edits persist and publication cannot bypass required review.
- Both ingestion paths retain playable media and use the same processing implementation.
- Representative sample processing completes in under one hour, with actual timing reported.
- Evaluation expense remains below USD 10; no junior behaviour changes.
