import { describe, expect, it } from 'vitest';

import type { CaptureSessionView } from './api-client';
import { prioritizeCaptureSessions } from './capture-selection';

const base: CaptureSessionView = {
  id: 'capture',
  workflowId: 'workflow',
  state: 'preparing',
  connectionStatus: 'disconnected',
};

describe('prioritizeCaptureSessions', () => {
  it('puts preserved processed evidence ahead of an expired empty pairing attempt', () => {
    const stale = { ...base, id: 'stale', pairingExpiresAt: '2026-09-12T00:00:00.000Z' };
    const processed = {
      ...base,
      id: 'processed',
      state: 'completed' as const,
      source: 'import' as const,
      processingStatus: 'completed' as const,
      mediaAsset: { id: 'asset', state: 'available' as const },
    };

    expect(prioritizeCaptureSessions([stale, processed], Date.parse('2026-09-13T00:00:00.000Z')).map(({ id }) => id))
      .toEqual(['processed', 'stale']);
  });

  it('keeps a current pairing attempt first', () => {
    const current = { ...base, id: 'current', pairingExpiresAt: '2026-09-14T00:00:00.000Z' };
    const processed = { ...base, id: 'processed', state: 'completed' as const };

    expect(prioritizeCaptureSessions([current, processed], Date.parse('2026-09-13T00:00:00.000Z')).map(({ id }) => id))
      .toEqual(['current', 'processed']);
  });

  it('still returns an expired preparation when it is the only capture', () => {
    const stale = { ...base, id: 'stale', pairingExpiresAt: '2026-09-12T00:00:00.000Z' };
    expect(prioritizeCaptureSessions([stale], Date.parse('2026-09-13T00:00:00.000Z'))).toEqual([stale]);
  });
});
