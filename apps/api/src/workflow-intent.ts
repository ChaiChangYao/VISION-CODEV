import { WorkflowIntentSchema, type WorkflowIntent } from '@vision-codef/contracts';

const goldenCues = [
  'teach',
  'procedure',
  'maintenance',
  'training',
  'steps',
  'repair',
  'assembly',
  'inspection',
  'demonstration',
  'how to',
  'expert',
  'guide',
  'sequence',
  'fold',
  'approved',
];

const cameraCues = [
  'detect',
  'alert',
  'camera',
  'premises',
  'after hours',
  'zone',
  'person',
  'vehicle',
  'notify',
  'cctv',
  'event',
];

export function classifyWorkflowIntent(text: string): WorkflowIntent {
  const value = text.toLowerCase();
  const goldenHits = goldenCues.filter((cue) => value.includes(cue)).length;
  const cameraHits = cameraCues.filter((cue) => value.includes(cue)).length;
  const family =
    goldenHits === cameraHits
      ? 'ambiguous'
      : goldenHits > cameraHits
        ? 'golden_run'
        : 'camera_automation';
  const confidence =
    family === 'ambiguous'
      ? 0.5
      : Math.min(
          0.98,
          0.55 +
            (Math.abs(goldenHits - cameraHits) / Math.max(goldenHits + cameraHits, 1)) * 0.4,
        );

  return WorkflowIntentSchema.parse({
    family,
    confidence,
    rationale:
      family === 'ambiguous'
        ? 'The request needs one workflow-family choice.'
        : `Matched ${family === 'golden_run' ? goldenHits : cameraHits} workflow cue(s).`,
    extractedGoal: text.trim(),
    mentionedDevices: [],
    mentionedConditions: [],
    mentionedActions: [],
    missingCriticalFields: family === 'ambiguous' ? ['workflow family'] : [],
  });
}

export function resolveWorkflowIntent(
  text: string,
  requestedFamily: unknown,
): WorkflowIntent {
  const classified = classifyWorkflowIntent(text);
  if (requestedFamily !== 'golden_run' && requestedFamily !== 'camera_automation') {
    return classified;
  }

  return WorkflowIntentSchema.parse({
    ...classified,
    family: requestedFamily,
    confidence: 1,
    rationale: 'The workflow family was explicitly selected by the user.',
    missingCriticalFields: [],
  });
}
