import type { CaptureState } from '@vision-codef/contracts';
import type { CaptureEvent, DeploymentEvent, DeploymentState, ReducerResult } from './types.js';

const captureTransitions: Record<
  CaptureState,
  Partial<Record<CaptureEvent['type'], CaptureState>>
> = {
  draft: { PREPARE: 'preparing', FAIL: 'failed' },
  preparing: { START: 'active', FAIL: 'failed' },
  active: { PAUSE: 'paused', FINALIZE: 'finalizing', FAIL: 'failed' },
  paused: { RESUME: 'active', FINALIZE: 'finalizing', FAIL: 'failed' },
  finalizing: { PROCESS: 'processing', FAIL: 'failed' },
  processing: { COMPLETE: 'completed', FAIL: 'failed' },
  completed: {},
  failed: {},
};

export function reduceCaptureState(
  state: CaptureState,
  event: CaptureEvent,
): ReducerResult<CaptureState> {
  const next = captureTransitions[state][event.type];
  return next
    ? { state: next, accepted: true }
    : { state, accepted: false, error: `Capture cannot accept ${event.type} while ${state}.` };
}

const deploymentTransitions: Record<
  DeploymentState,
  Partial<Record<DeploymentEvent['type'], DeploymentState>>
> = {
  draft: { READY: 'ready', FAIL: 'failed' },
  ready: { START: 'starting', FAIL: 'failed' },
  starting: { GUIDE: 'guiding', FAIL: 'failed' },
  guiding: {
    PAUSE: 'paused',
    INTERRUPT: 'interrupted',
    DEVIATION_DETECTED: 'recovery_required',
    COMPLETE: 'completed',
    FAIL: 'failed',
  },
  paused: { RESUME: 'guiding', FAIL: 'failed' },
  interrupted: { DEVIATION_DETECTED: 'recovery_required', RESUME: 'guiding', FAIL: 'failed' },
  recovery_required: { RECOVERY_STARTED: 'recovering', FAIL: 'failed' },
  recovering: { RECOVERY_RESOLVED: 'guiding', FAIL: 'failed' },
  completed: {},
  failed: {},
};

export function reduceDeploymentState(
  state: DeploymentState,
  event: DeploymentEvent,
): ReducerResult<DeploymentState> {
  const next = deploymentTransitions[state][event.type];
  return next
    ? { state: next, accepted: true }
    : { state, accepted: false, error: `Deployment cannot accept ${event.type} while ${state}.` };
}
