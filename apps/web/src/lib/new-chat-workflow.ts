import type { WorkflowIntent } from '@vision-codef/contracts';

export const GOLDEN_RUN_CONFIDENCE_THRESHOLD = 0.8;

export function normalizeWorkflowBrief(brief: string) {
  return brief.trim();
}

export function isUnambiguousGoldenRun(intent: WorkflowIntent) {
  return (
    intent.family === 'golden_run' &&
    intent.confidence >= GOLDEN_RUN_CONFIDENCE_THRESHOLD &&
    intent.missingCriticalFields.length === 0
  );
}

export function clarificationDetails(intent?: WorkflowIntent) {
  if (intent?.missingCriticalFields.length) {
    return `Add ${intent.missingCriticalFields.join(', ')} before creating the workflow.`;
  }

  return 'Tell us whether this should be a Golden Run or a camera-based rule before creating it.';
}
