import { describe, expect, it } from 'vitest';

import { INITIAL_CAPTURE_MACHINE_STATE, transition } from './captureSessionMachine';

describe('capture session state machine', () => {
  it('requires a connected room and published tracks before active capture', () => {
    const preparing = transition(INITIAL_CAPTURE_MACHINE_STATE, { type: 'PREPARE' }).to;
    const connected = transition(preparing, { type: 'ROOM_CONNECTED' }).to;
    expect(connected.capture).toBe('preparing');
    expect(transition(connected, { type: 'PUBLISH_SUCCEEDED' }).to).toEqual({
      capture: 'active',
      connection: 'connected',
    });
  });

  it('pauses for app backgrounding and resumes after reconnect', () => {
    const active = { capture: 'active' as const, connection: 'connected' as const };
    const paused = transition(active, { type: 'PAUSE', reason: 'app_backgrounded' }).to;
    expect(paused.capture).toBe('paused');
    const reconnecting = transition(paused, { type: 'RECONNECTING' }).to;
    expect(reconnecting.connection).toBe('reconnecting');
    const reconnected = transition(reconnecting, { type: 'RECONNECTED' }).to;
    expect(transition(reconnected, { type: 'RESUME' }).to).toEqual({
      capture: 'active',
      connection: 'connected',
    });
  });

  it('never invents a path from processing back into active capture', () => {
    const processing = { capture: 'processing' as const, connection: 'disconnected' as const };
    expect(transition(processing, { type: 'RESUME' }).to).toBe(processing);
  });
});
