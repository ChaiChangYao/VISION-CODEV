import type { CaptureState, ConnectionState } from '../types';

export type CaptureEvent =
  | { type: 'PREPARE' }
  | { type: 'ROOM_CONNECTED' }
  | { type: 'PUBLISH_SUCCEEDED' }
  | { type: 'PAUSE'; reason: 'app_backgrounded' | 'audio_interruption' | 'manual' }
  | { type: 'RESUME' }
  | { type: 'RECONNECTING' }
  | { type: 'RECONNECTED' }
  | { type: 'DISCONNECTED'; reason?: string }
  | { type: 'FINALIZE' }
  | { type: 'PROCESSING' }
  | { type: 'COMPLETED' }
  | { type: 'FAILED'; error: string }
  | { type: 'RECOVERY_REQUESTED' };

export type CaptureMachineState = {
  capture: CaptureState;
  connection: ConnectionState;
  error?: string;
};

export type CaptureTransition = {
  from: CaptureMachineState;
  event: CaptureEvent;
  to: CaptureMachineState;
};

const failed = (error: string): CaptureMachineState => ({
  capture: 'failed',
  connection: 'failed',
  error,
});

export function transition(state: CaptureMachineState, event: CaptureEvent): CaptureTransition {
  const next = reduce(state, event);
  return { from: state, event, to: next };
}

function reduce(state: CaptureMachineState, event: CaptureEvent): CaptureMachineState {
  switch (event.type) {
    case 'PREPARE':
      return state.capture === 'draft' || state.capture === 'failed'
        ? { capture: 'preparing', connection: 'connecting' }
        : state;
    case 'ROOM_CONNECTED':
      return state.capture === 'preparing'
        ? { capture: 'preparing', connection: 'connected' }
        : state;
    case 'PUBLISH_SUCCEEDED':
      return state.capture === 'preparing' && state.connection === 'connected'
        ? { capture: 'active', connection: 'connected' }
        : state;
    case 'PAUSE':
      return state.capture === 'active'
        ? { capture: 'paused', connection: event.reason === 'audio_interruption' ? 'interrupted' : state.connection }
        : state;
    case 'RESUME':
      return state.capture === 'paused'
        ? { capture: 'active', connection: state.connection === 'interrupted' ? 'connected' : state.connection }
        : state;
    case 'RECONNECTING':
      return state.capture === 'active' || state.capture === 'paused'
        ? { ...state, connection: 'reconnecting' }
        : state;
    case 'RECONNECTED':
      return state.capture === 'active' || state.capture === 'paused'
        ? { ...state, connection: 'connected' }
        : state;
    case 'DISCONNECTED':
      return state.capture === 'finalizing' || state.capture === 'completed'
        ? state
        : failed(event.reason ?? 'LiveKit disconnected');
    case 'FINALIZE':
      return state.capture === 'active' || state.capture === 'paused'
        ? { capture: 'finalizing', connection: 'connected' }
        : state;
    case 'PROCESSING':
      return state.capture === 'finalizing' ? { capture: 'processing', connection: 'disconnected' } : state;
    case 'COMPLETED':
      return state.capture === 'processing' ? { capture: 'completed', connection: 'disconnected' } : state;
    case 'FAILED':
      return failed(event.error);
    case 'RECOVERY_REQUESTED':
      return state;
  }
}

export const INITIAL_CAPTURE_MACHINE_STATE: CaptureMachineState = {
  capture: 'draft',
  connection: 'disconnected',
};
