# Annotation and reference-pack boundary

Senior review produces governed workflow evidence without changing model weights. A procedure annotation binds one procedure step to a bounded capture interval and records the observed object/action, expected state, correct/deviation/uncertain verdict, expected next action, senior reasoning, and optional document locators.

Annotations preserve their origin and review status. Model proposals remain `proposed` until a company member approves or rejects them. Rejected proposals remain available for audit but are excluded from published reference packs. Approved annotations record the reviewer and revision timestamps.

## Reference-conditioned inference

A reference pack is an immutable, content-hashed snapshot of senior-approved annotations for one published procedure version. Its entries contain media locators and comparison text suitable for a future multimodal embedding or retrieval provider. Publishing a pack never creates synthetic vectors: `embeddingStatus` remains `not_generated` until an external provider has generated and persisted real embeddings.

The intended runtime path is:

`live frame -> retrieve step-scoped approved examples -> VLM observation -> deterministic procedure engine -> continue, request visibility, or interrupt`

Document retrieval grounds requirements and explanations; it does not teach the model visual appearance by itself. Visual examples provide appearance evidence. A LoRA or other parameter-efficient adapter should be trained only after enough representative data has been pooled across a reusable domain and evaluated against a frozen holdout set. Per-workflow adapters are not part of the first slice.

## Claim boundary

A retrieval-ready pack proves that reviewed knowledge can be supplied to a model. It does not prove recognition accuracy, realtime latency, or safety suitability. Those claims remain gated on representative correct, deviation, and uncertain recordings plus a frozen acceptance set.
