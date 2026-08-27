import { Camera } from 'expo-camera';
import { AppState, type AppStateStatus } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import {
  INITIAL_CAPTURE_MACHINE_STATE,
  transition,
  type CaptureEvent,
  type CaptureMachineState,
} from '../capture/captureSessionMachine';
import { LiveKitAudioRouteManager, type AudioRouteManager } from '../audio/audioRouteManager';
import type { CaptureSnapshot, FacingMode, RecoveryRequest, RecoverySegment } from '../types';
import { LiveKitPhoneClient } from './livekitPhoneClient';
import { RollingRecoveryBuffer } from '../recovery/rollingRecoveryBuffer';

const WAKE_TAG = 'vision-codef-capture';

export class PhoneCaptureSession {
  private machine: CaptureMachineState = INITIAL_CAPTURE_MACHINE_STATE;
  private appStateSubscription: { remove(): void } | undefined;
  private readonly listeners = new Set<(snapshot: CaptureSnapshot) => void>();
  private readonly audio: AudioRouteManager;
  private readonly client: LiveKitPhoneClient;
  private readonly recoveryBuffer: RollingRecoveryBuffer;
  private readonly sessionId: string;
  private publishedAudio = false;
  private publishedVideo = false;
  private egressHealthy = true;
  private recoveryPending = 0;
  private facingMode: FacingMode = 'rear';

  constructor(
    options: ConstructorParameters<typeof LiveKitPhoneClient>[0],
    recoveryBuffer = new RollingRecoveryBuffer(),
  ) {
    this.sessionId = options.sessionId ?? '';
    this.audio = new LiveKitAudioRouteManager();
    this.recoveryBuffer = recoveryBuffer;
    this.client = new LiveKitPhoneClient({
      ...options,
      onConnected: () => this.apply({ type: 'ROOM_CONNECTED' }),
      onReconnecting: () => this.apply({ type: 'RECONNECTING' }),
      onReconnected: () => this.apply({ type: 'RECONNECTED' }),
      onDisconnected: (reason) =>
        reason
          ? this.apply({ type: 'DISCONNECTED', reason })
          : this.apply({ type: 'DISCONNECTED' }),
      onTrackPublished: (kind) => {
        this.publishedAudio ||= kind === 'audio';
        this.publishedVideo ||= kind === 'video';
        if (
          this.client.isConnected &&
          this.publishedAudio &&
          this.publishedVideo &&
          this.machine.capture === 'preparing'
        ) {
          this.apply({ type: 'PUBLISH_SUCCEEDED' });
        }
      },
      onError: (error) => this.apply({ type: 'FAILED', error: error.message }),
    });
  }

  subscribe(listener: (snapshot: CaptureSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): CaptureSnapshot {
    return {
      state: this.machine.capture,
      connection: this.machine.connection,
      sessionId: this.sessionId,
      facingMode: this.facingMode,
      orientation: 'portrait',
      audioRoute: this.audio.current(),
      egressHealthy: this.egressHealthy,
      recoveryPending: this.recoveryPending,
      ...(this.machine.error ? { error: this.machine.error } : {}),
    };
  }

  async start(): Promise<void> {
    this.publishedAudio = false;
    this.publishedVideo = false;
    this.apply({ type: 'PREPARE' });
    const camera = await Camera.requestCameraPermissionsAsync();
    const microphone = await Camera.requestMicrophonePermissionsAsync();
    if (!camera.granted || !microphone.granted) {
      this.apply({ type: 'FAILED', error: 'Camera and microphone permissions are required.' });
      return;
    }

    await activateKeepAwakeAsync(WAKE_TAG);
    await this.audio.start();
    this.appStateSubscription = AppState.addEventListener('change', this.onAppStateChange);
    await this.client.connect();
  }

  async stop(): Promise<void> {
    if (this.machine.capture !== 'active' && this.machine.capture !== 'paused') return;
    this.apply({ type: 'FINALIZE' });
    this.appStateSubscription?.remove();
    this.appStateSubscription = undefined;
    await this.client.disconnect();
    await this.audio.stop();
    deactivateKeepAwake(WAKE_TAG);
  }

  async retry(): Promise<void> {
    if (this.machine.capture !== 'failed') return;
    await this.start();
  }

  async switchCamera(): Promise<void> {
    this.facingMode = await this.client.switchCamera();
    this.emit();
  }

  setAudioRouteHint(route: Exclude<CaptureSnapshot['audioRoute'], 'unknown'>): void {
    this.audio.setRouteHint(route);
    this.emit();
  }

  notifyAudioInterruptionStarted(): void {
    if (this.machine.capture === 'active')
      this.apply({ type: 'PAUSE', reason: 'audio_interruption' });
  }

  notifyAudioInterruptionEnded(): void {
    this.client.notifyAudioInterruptionEnded();
    if (this.machine.capture === 'paused' && this.machine.connection === 'connected') {
      this.apply({ type: 'RESUME' });
    }
  }

  setEgressHealth(healthy: boolean): void {
    this.egressHealthy = healthy;
    this.emit();
  }

  async appendRecoverySegment(segment: RecoverySegment, bytes: Uint8Array): Promise<void> {
    await this.recoveryBuffer.append(segment, bytes);
  }

  async prepareRecoveryUpload(
    request: RecoveryRequest,
  ): Promise<Awaited<ReturnType<RollingRecoveryBuffer['drainForRequest']>>> {
    this.recoveryPending += 1;
    this.apply({ type: 'RECOVERY_REQUESTED' });
    return this.recoveryBuffer.drainForRequest(request);
  }

  acknowledgeRecovery(segmentIds: readonly string[]): Promise<void> {
    this.recoveryPending = Math.max(0, this.recoveryPending - 1);
    return this.recoveryBuffer.acknowledgeReconciled(segmentIds).then(() => this.emit());
  }

  dispose(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = undefined;
    deactivateKeepAwake(WAKE_TAG);
    void this.client.disconnect();
    void this.audio.stop();
  }

  private readonly onAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState !== 'active' && this.machine.capture === 'active') {
      this.apply({ type: 'PAUSE', reason: 'app_backgrounded' });
    }
    if (
      nextState === 'active' &&
      this.machine.capture === 'paused' &&
      this.machine.connection === 'connected'
    ) {
      this.apply({ type: 'RESUME' });
    }
  };

  private apply(event: CaptureEvent): void {
    const next = transition(this.machine, event).to;
    if (next === this.machine) return;
    this.machine = next;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
