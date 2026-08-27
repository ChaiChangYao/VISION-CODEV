import { describe, expect, it } from 'vitest';
import type { WorkflowIntent } from '@vision-codef/contracts';
import {
  clarificationDetails,
  isUnambiguousGoldenRun,
  normalizeWorkflowBrief,
} from './new-chat-workflow';

const intent = (overrides: Partial<WorkflowIntent> = {}): WorkflowIntent => ({
  family: 'golden_run',
  confidence: 0.94,
  rationale: 'The brief describes a teachable procedure.',
  extractedGoal: 'Fold a paper crane.',
  mentionedDevices: [],
  mentionedConditions: [],
  mentionedActions: ['fold'],
  missingCriticalFields: [],
  ...overrides,
});

describe('New Chat workflow routing', () => {
  it('normalizes the brief sent to workflow creation', () => {
    expect(normalizeWorkflowBrief('  Fold a paper crane.  ')).toBe('Fold a paper crane.');
  });

  it('only creates a workflow for a confident, complete Golden Run intent', () => {
    expect(isUnambiguousGoldenRun(intent())).toBe(true);
    expect(isUnambiguousGoldenRun(intent({ family: 'ambiguous' }))).toBe(false);
    expect(isUnambiguousGoldenRun(intent({ confidence: 0.79 }))).toBe(false);
    expect(isUnambiguousGoldenRun(intent({ missingCriticalFields: ['workflow family'] }))).toBe(false);
  });

  it('keeps clarification details actionable', () => {
    expect(clarificationDetails(intent({ missingCriticalFields: ['workflow family'] }))).toContain(
      'workflow family',
    );
    expect(clarificationDetails()).toContain('Golden Run');
  });
});
