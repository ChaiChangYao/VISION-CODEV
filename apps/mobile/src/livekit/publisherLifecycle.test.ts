import { describe, expect, it, vi } from 'vitest';

import {
  BACKGROUND_CAMERA_CAPTURE_SUPPORTED,
  LiveKitPublisherLifecycle,
  PublisherGateError,
  type ConnectionEvent,
  type LiveKitPublisherBoundary,
} from './publisherLifecycle';

type FakeTrack = { id: string };

function fakeBoundary() {
  let connectionListener: ((event: ConnectionEvent) => void) | undefined;
  const boundary: LiveKitPublisherBoundary<FakeTrack> = {
    connect: vi.fn(async () => connectionListener?.({ type: 'connected' })),
    createLocalTracks: vi.fn(async () => ({
      camera: { id: 'camera' },
      microphone: { id: 'microphone' },
    })),
    publishTrack: vi.fn(async () => undefined),
    stopTrack: vi.fn(),
    disconnect: vi.fn(async () => undefined),
    subscribeConnectionEvents: vi.fn((listener: (event: ConnectionEvent) => void) => {
      connectionListener = listener;
      return () => {
        connectionListener = undefined;
      };
    }),
  };
  return { boundary, emit: (event: ConnectionEvent) => connectionListener?.(event) };
}

describe('LiveKitPublisherLifecycle', () => {
  it('requires both an active session and the foreground before connecting', async () => {
    const { boundary } = fakeBoundary();
    const lifecycle = new LiveKitPublisherLifecycle({
      serverUrl: 'wss://livekit.test',
      getToken: vi.fn(async () => 'token'),
      boundary,
      foreground: 'background',
    });

    await expect(lifecycle.start()).rejects.toMatchObject({ code: 'SESSION_INACTIVE' });
    expect(boundary.connect).not.toHaveBeenCalled();

    await lifecycle.setSessionActive(true);
    await expect(lifecycle.reconnect()).rejects.toMatchObject({
      code: 'APP_NOT_FOREGROUNDED',
    });
    expect(boundary.connect).not.toHaveBeenCalled();
  });

  it('connects once and explicitly publishes camera before microphone', async () => {
    const { boundary } = fakeBoundary();
    const lifecycle = new LiveKitPublisherLifecycle({
      serverUrl: 'wss://livekit.test',
      getToken: vi.fn(async () => 'token'),
      boundary,
      sessionActive: true,
    });

    await lifecycle.start();

    expect(boundary.connect).toHaveBeenCalledWith('wss://livekit.test', 'token');
    expect(boundary.createLocalTracks).toHaveBeenCalledOnce();
    expect(boundary.publishTrack).toHaveBeenNthCalledWith(1, { id: 'camera' }, 'camera');
    expect(boundary.publishTrack).toHaveBeenNthCalledWith(2, { id: 'microphone' }, 'microphone');
    expect(lifecycle.snapshot()).toMatchObject({
      state: 'publishing',
      cameraPublished: true,
      microphonePublished: true,
    });
  });

  it('disconnects when backgrounded and reconnects only after foregrounding', async () => {
    const { boundary } = fakeBoundary();
    const lifecycle = new LiveKitPublisherLifecycle({
      serverUrl: 'wss://livekit.test',
      getToken: vi.fn(async () => 'token'),
      boundary,
      sessionActive: true,
    });
    await lifecycle.start();

    await lifecycle.setForeground('background');
    expect(boundary.disconnect).toHaveBeenCalledOnce();
    expect(lifecycle.snapshot()).toMatchObject({
      state: 'paused',
      foreground: 'background',
      cameraPublished: false,
      microphonePublished: false,
    });

    await lifecycle.setForeground('active');
    expect(boundary.connect).toHaveBeenCalledTimes(2);
    expect(lifecycle.snapshot().state).toBe('publishing');
  });

  it('surfaces reconnect and unexpected disconnect hooks without inventing background capture', async () => {
    const { boundary, emit } = fakeBoundary();
    const onConnectionEvent = vi.fn();
    const lifecycle = new LiveKitPublisherLifecycle({
      serverUrl: 'wss://livekit.test',
      getToken: vi.fn(async () => 'token'),
      boundary,
      sessionActive: true,
      onConnectionEvent,
    });
    await lifecycle.start();

    emit({ type: 'reconnecting' });
    expect(lifecycle.snapshot().state).toBe('reconnecting');
    emit({ type: 'reconnected' });
    expect(lifecycle.snapshot().state).toBe('publishing');
    emit({ type: 'disconnected', reason: 'network lost' });
    expect(lifecycle.snapshot().state).toBe('disconnected');
    expect(onConnectionEvent).toHaveBeenCalledWith({ type: 'disconnected', reason: 'network lost' });
    expect(BACKGROUND_CAMERA_CAPTURE_SUPPORTED).toBe(false);
  });

  it('does not reconnect after an explicit stop', async () => {
    const { boundary } = fakeBoundary();
    const lifecycle = new LiveKitPublisherLifecycle({
      serverUrl: 'wss://livekit.test',
      getToken: vi.fn(async () => 'token'),
      boundary,
      sessionActive: true,
    });
    await lifecycle.start();
    await lifecycle.stop();
    await lifecycle.setForeground('background');
    await lifecycle.setForeground('active');

    expect(boundary.connect).toHaveBeenCalledOnce();
    expect(lifecycle.snapshot()).toMatchObject({ state: 'stopped', sessionActive: false });
  });
});
