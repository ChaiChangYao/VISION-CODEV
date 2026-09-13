import { z } from 'zod';

const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const PaperCraneObservationSchema = z.object({
  timestampMs: z.number().finite().nonnegative(),
  corners: z.tuple([PointSchema, PointSchema, PointSchema, PointSchema]),
  foldState: z.enum([
    'flat',
    'diagonal-left',
    'diagonal-right',
    'triangle',
    'completed',
    'unknown',
  ]),
  visibilityScore: z.number().min(0).max(1),
  alignmentScore: z.number().min(0).max(1),
  handOccluded: z.boolean(),
});

export type PaperCraneObservation = z.infer<typeof PaperCraneObservationSchema>;

export const TechnicianStepObservationSchema = z.object({
  timestampMs: z.number().finite().nonnegative(),
  stepId: z.string().uuid(),
  assessment: z.enum(['uncertain', 'in_progress', 'completed', 'deviation']),
  confidence: z.number().min(0).max(1),
  observedAction: z.string().max(500),
  evidence: z.string().max(500),
  deviationDetail: z.string().max(300).optional(),
});

export type TechnicianStepObservation = z.infer<typeof TechnicianStepObservationSchema>;

export const ApprovedStepContextSchema = z.object({
  id: z.string().uuid(),
  ordinal: z.number().int().positive(),
  totalSteps: z.number().int().positive(),
  title: z.string().min(1),
  instruction: z.string().min(1),
  observedAction: z.string().min(1),
  startState: z.array(z.string()),
  expectedAction: z.array(z.string()),
  endState: z.array(z.string()),
  allowableVariations: z.array(z.string()),
  deviationRules: z.array(z.string()),
  completionCheck: z.string(),
  seniorReasoning: z.string(),
});

export type ApprovedStepContext = z.infer<typeof ApprovedStepContextSchema>;

export const GuidanceConnectionSchema = z.object({
  token: z.string().min(1),
  serverUrl: z.string().min(1),
  roomName: z.string().min(1),
  deploymentId: z.string().uuid(),
  observationPath: z.string().startsWith('/v1/'),
  currentInstruction: z.string().min(1),
  currentStep: ApprovedStepContextSchema,
});

export type GuidanceConnection = z.infer<typeof GuidanceConnectionSchema>;

export const GuidanceDecisionSchema = z.object({
  decision: z.enum(['WAIT', 'ADVANCED', 'REQUEST_VISIBILITY', 'INTERRUPT']),
  decisionReason: z.string().min(1),
  currentInstruction: z.string().min(1).optional(),
  currentStep: ApprovedStepContextSchema.optional(),
  intervention: z
    .object({
      detail: z.string().optional(),
      recoveryStepId: z.string().optional(),
    })
    .optional(),
});

export type GuidanceDecision = z.infer<typeof GuidanceDecisionSchema>;

export type GuidanceMessage =
  | { type: 'speak'; text: string; priority: 'normal' | 'urgent' }
  | { type: 'interrupt' };

export type FrameSample = {
  data: Uint8Array;
  width: number;
  height: number;
  pixelFormat: 'rgba';
  timestampMs: number;
  participantIdentity: string;
};

export function uncertainStepObservation(timestampMs: number, stepId: string): TechnicianStepObservation {
  return {
    timestampMs,
    stepId,
    assessment: 'uncertain',
    confidence: 0,
    observedAction: '',
    evidence: '',
  };
}

export function uncertainObservation(timestampMs: number): PaperCraneObservation {
  return {
    timestampMs,
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    foldState: 'unknown',
    visibilityScore: 0,
    alignmentScore: 0,
    handOccluded: true,
  };
}
