import type { ProcedureGraph } from '@vision-codef/contracts';
import { sha256 } from './canonical.js';
import type { InductionDraft, InductionReplayRecord, InductionRequest } from './types.js';

export interface ProcedureInductionProvider {
  induce(request: InductionRequest): Promise<InductionDraft>;
}

export function inductionRequestFingerprint(request: InductionRequest): string {
  return sha256({
    ...request,
    inputMediaHashes: [...request.inputMediaHashes].sort(),
    retrievedEvidenceIds: [...request.retrievedEvidenceIds].sort(),
  });
}

export async function induceReplayable(
  provider: ProcedureInductionProvider,
  request: InductionRequest,
): Promise<InductionReplayRecord> {
  const draft = await provider.induce(request);
  return { request, draft, requestFingerprint: inductionRequestFingerprint(request) };
}

export function replayInduction(record: InductionReplayRecord): InductionDraft {
  const expected = inductionRequestFingerprint(record.request);
  if (expected !== record.requestFingerprint) throw new Error('Induction replay fingerprint mismatch.');
  return structuredClone(record.draft);
}

export function assertPinnedInduction(request: InductionRequest): void {
  const required = ['modelId', 'modelVersion', 'adapterVersion', 'promptVersion'];
  for (const field of required as Array<keyof InductionRequest>) {
    const value = request[field];
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} must be pinned for replayable induction.`);
  }
}

export function draftGraphFromReplay(record: InductionReplayRecord): ProcedureGraph {
  assertPinnedInduction(record.request);
  return replayInduction(record).graph;
}
