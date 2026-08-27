import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, WorkflowIntentSchema } from './index';

describe('shared contracts', () => {
  it('validates versioned workflow intent payloads', () => {
    expect(CONTRACT_VERSION).toBe('0.1');
    expect(WorkflowIntentSchema.parse({
      family: 'golden_run', confidence: 0.9, rationale: 'procedure cues', extractedGoal: 'teach a repair',
      mentionedDevices: [], mentionedConditions: [], mentionedActions: [], missingCriticalFields: [],
    }).family).toBe('golden_run');
  });
});

