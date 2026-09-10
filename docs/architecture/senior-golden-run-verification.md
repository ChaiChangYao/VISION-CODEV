# Senior Golden Run — implementation and verification

## Delivered scope

Senior recording / MP4 import → full-recording API analysis → editable action draft → explicit self-review → publication. Existing phone ingestion is retained; this release does not change the Android binary or add junior guidance. Original media and processing observations remain separate from reviewer edits.

The OpenAI path now uses four-second core windows with one-second context overlap and four timestamped frames per second at 768-pixel width. There is no global three-action or twelve-event cap. Each window may return multiple actions, including concurrent work. Results retain object, hand, before/after visible state, grouping and uncertainty. Frame-derived timing is approximate, not frame-perfect segmentation.

Successful windows are cached by source hash, transcript, prompt, model and analysis settings, within the company namespace. Retries reuse those checkpoints. Downloads go through temporary files and verified hashes. The worker reports real completed-window counts to the desktop. Existing five-attempt retry behaviour is retained; the long-running analysis activity has a heartbeat and a longer deadline.

The new review screen has original video, action list, instruction, optional reasoning/check/reference, review confirmation and save/publish. Timing, hand/object details and add/split/merge/remove sit behind secondary controls. Changing an action clears its approval; restructuring clears approvals. Source-analysis metadata cannot be removed to bypass the new publication gate. Legacy graphs keep their existing editor.

## Paid sample evaluation

Only the four supplied **source** videos were submitted. Annotation videos/panels were read locally as comparison references, never supplied to the model. All four clips are approximately 15 seconds long and silent. Silence detection avoids unnecessary transcription calls; these tests do not establish narrated-recording quality.

Three configurations were tried under one shared USD 10 ledger: initial 8-second/2-fps windows, revised wording at the same sampling, and final 4-second/4-fps windows with medium reasoning. Final run:

| Source | Windows completed | Draft actions | Processing time |
| --- | ---: | ---: | ---: |
| Rubber | 4/4 | 10 | 89.8 seconds |
| Automotive | 4/4 | 9 | 121.2 seconds |
| Electronics | 4/4 | 15 | 117.6 seconds |
| Auto-repair | 4/4 | 14 | 90.7 seconds |

These are observed durations, not an SLA for long recordings. More actions does **not** prove better accuracy. The final samples still contain incorrect hand assignments, speculative object/tool labels, missed fine motions and overlapping/redundant descriptions. In particular, the automotive reference has 13 stroke-level annotations; the nine generated actions do not reproduce all those boundaries. Rubber includes a wrong hand assignment and over-segmentation. Electronics includes broad sweeps and object descriptions that need correction.

**Conclusion: useful review infrastructure and a more detailed candidate draft, not demonstrated Vision Lab-level action accuracy. Do not use the unreviewed output to guide work.** A next quality experiment should compare a genuinely video-native provider or stronger model with blinded action-level scoring, rather than merely optimizing action counts. Hand/contact tracking may supply motion boundaries but cannot establish the task or technician reasoning by itself.

## Budget and operation

The local ledger is `.run/local-processing/senior-api-budget.json`. It persists across evaluation and service calls; deleting it would remove the accounting history and must not be used to evade the cap. The service is capped at USD 10 total (or a lower `VISION_CODEF_SENIOR_BUDGET_USD`). It does not replenish automatically.

Each vision call reserves USD 0.12 before sending. Successful responses settle against reported input/output tokens; uncertain failures keep the full reservation. The supported budgeted provider is official OpenAI `gpt-5-mini` only, with a 6,000-output-token cap and no tools. Whisper calls conservatively reserve by media duration; silent samples incur none. Rates used: [official GPT-5 mini pricing](https://developers.openai.com/api/docs/models/gpt-5-mini). Costs are local estimates, not an invoice reconciliation.

Reproduce evaluation from `services/local-processing`: `pnpm exec tsx src/senior-evaluate.ts`. Outputs live in `.run/senior-evaluation`. Repeating an unchanged configuration reuses window checkpoints. `senior-smoke.ts` creates one explicitly named local test workflow and checks ingestion, processing, playback, draft persistence and rejected unreviewed publication. It leaves the recording and draft in place.

## Verification results

- 72 passing tests across local processing (10), workflow engine (7), web (12), worker (9), and API (34). Includes resume-after-failure, pre-call budget rejection, timestamp validation and review-required publication.
- Production builds and TypeScript checks passed for the changed services/UI. The existing Next.js multiple-lockfile warning is non-blocking.
- Live MP4 integration passed through API → Temporal → local processing → completion callback. Progress advanced by completed windows (53%, 62%, 70%, then 100%), rather than staying at a fixed percentage.
- Original playback payload size matched the imported MP4; an edited instruction survived a GET after PATCH and was then restored. Unreviewed publication and removal of source-analysis metadata were rejected. The test draft remains unapproved.
- Browser inspection showed the real source video alongside 12 actions and a disabled publication button at 0 reviewed actions. A stale header status and incorrect initial unsaved indicator found during inspection were corrected.
- Final browser interaction confirmed an edited instruction survived switching to another action and back. The temporary test wording was restored and saved; the header showed Needs Review and the draft remained unapproved.
- Total local API accounting after all three four-clip evaluations plus one end-to-end upload: **USD 0.197782** across 36 vision requests. No transcription charges for these silent clips. The USD 10 cap remains in place.

Test draft: `http://localhost:3000/workflows/01a08712-bca3-7179-b0a9-879c3bbb61f0/approve`.

## Remaining limits

- Physical Android capture was not rerun during this implementation; it shares the existing downstream processing route with MP4 import.
- Long-video throughput and real narration require additional tests. A long recording is not guaranteed to finish in under an hour.
- Local checkpoints survive process restarts, not laptop/disk loss. Production deployment needs durable shared checkpoint storage and stronger job orchestration limits.
- The reference examples are comparison material, not independently verified ground truth.
- Published senior knowledge is not yet wired into a new junior recognition/guidance system in this release.
