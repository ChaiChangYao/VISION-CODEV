import type { ProcedureGraph } from '@vision-codef/contracts';
import {
  assertPinnedInduction,
  draftGraphFromReplay,
  induceReplayable,
  normalizeProcedureGraph,
  replayInduction,
  type InductionReplayRecord,
  type InductionRequest,
  type ProcedureInductionProvider,
  validateProcedureGraph,
} from '@vision-codef/workflow-engine';

export interface ProcedureDraftResult {
  replay: InductionReplayRecord;
  normalizedGraph: ProcedureGraph;
  validation: ReturnType<typeof validateProcedureGraph>;
}

export class ProcedureIntelligenceService {
  constructor(private readonly provider: ProcedureInductionProvider) {}

  async createDraft(request: InductionRequest): Promise<ProcedureDraftResult> {
    assertPinnedInduction(request);
    const replay = await induceReplayable(this.provider, request);
    const normalizedGraph = normalizeProcedureGraph(draftGraphFromReplay(replay));
    return { replay, normalizedGraph, validation: validateProcedureGraph(normalizedGraph) };
  }

  replayDraft(replay: InductionReplayRecord): ProcedureDraftResult {
    const draft = replayInduction(replay);
    const normalizedGraph = normalizeProcedureGraph(draft.graph);
    return { replay, normalizedGraph, validation: validateProcedureGraph(normalizedGraph) };
  }
}
