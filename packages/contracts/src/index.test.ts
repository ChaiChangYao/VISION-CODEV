import { describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
  ProcedureAnnotationInputSchema,
  VoiceEventSchema,
  ProcedureStepSchema,
  WorkflowIntentSchema,
} from './index';

describe('shared contracts', () => {
  it('validates bounded realtime voice events', () => {
    expect(VoiceEventSchema.parse({ type: 'GUIDANCE_START', stepId: 'step-1' }).type).toBe(
      'GUIDANCE_START',
    );
    expect(() => VoiceEventSchema.parse({ type: 'INTERRUPT' })).toThrow();
  });
  it('validates versioned workflow intent payloads', () => {
    expect(CONTRACT_VERSION).toBe('0.1');
    expect(
      WorkflowIntentSchema.parse({
        family: 'golden_run',
        confidence: 0.9,
        rationale: 'procedure cues',
        extractedGoal: 'teach a repair',
        mentionedDevices: [],
        mentionedConditions: [],
        mentionedActions: [],
        missingCriticalFields: [],
      }).family,
    ).toBe('golden_run');
  });

  it('requires bounded media and failure labels for reviewed deviations', () => {
    const base = {
      stepId: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e22',
      captureSessionId: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e23',
      startMs: 1000,
      endMs: 2400,
      verdict: 'deviation' as const,
      objectName: 'brake pad',
      observedAction: 'installed backwards',
      expectedState: 'wear indicator faces inward',
      expectedNextAction: 'remove and reinstall the pad',
      reasoning: 'The wear indicator is visible on the wrong edge.',
      documentEvidence: [],
      origin: 'senior' as const,
      reviewStatus: 'approved' as const,
    };
    expect(ProcedureAnnotationInputSchema.safeParse(base).success).toBe(false);
    const annotation = ProcedureAnnotationInputSchema.parse({
      ...base,
      failureType: 'wrong_orientation',
      severity: 'major',
      confidence: 0.8,
      schemaVersion: 1,
    });
    expect(annotation.failureType).toBe('wrong_orientation');
    expect(annotation.severity).toBe('major');
    expect(annotation.confidence).toBe(0.8);
    expect(
      ProcedureAnnotationInputSchema.safeParse({
        ...base,
        failureType: 'wrong_orientation',
        endMs: 500,
      }).success,
    ).toBe(false);
    expect(
      ProcedureAnnotationInputSchema.safeParse({
        ...base,
        failureType: 'wrong_orientation',
        confidence: 1.1,
      }).success,
    ).toBe(false);
    expect(
      ProcedureAnnotationInputSchema.safeParse({
        ...base,
        failureType: 'wrong_orientation',
        severity: 'catastrophic',
      }).success,
    ).toBe(false);
  });

  it('validates optional generated evidence timing as one bounded set', () => {
    const step = {
      id: '018f0d8e-7b6d-7c2a-8c41-3d9a8d0f1e22', ordinalHint: 0, title: 'Move rack',
      instruction: 'Move rack A.', observedAction: 'Rack A moves.', evidenceRefs: [],
      provenance: ['MODEL_INFERENCE'], startState: ['ready'], expectedAction: ['move rack'],
      endState: ['placed'], allowableVariations: [], deviationRules: [], recoveryTransitions: [], confidence: 0.8,
    };
    expect(ProcedureStepSchema.parse({ ...step, evidenceStartMs: 1000, keyframeMs: 1500, evidenceEndMs: 2500 }).keyframeMs).toBe(1500);
    expect(ProcedureStepSchema.safeParse({ ...step, keyframeMs: 1500 }).success).toBe(false);
    expect(ProcedureStepSchema.safeParse({ ...step, evidenceStartMs: 1000, keyframeMs: 900, evidenceEndMs: 2500 }).success).toBe(false);
  });
});
