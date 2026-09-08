export type CaptureState =
  | 'draft'
  | 'preparing'
  | 'active'
  | 'paused'
  | 'finalizing'
  | 'processing'
  | 'completed'
  | 'failed';

export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'interrupted' | 'failed';

export type FacingMode = 'front' | 'rear';
export type DeviceOrientation = 'portrait' | 'landscape';

export type RecoveryRequest = {
  sessionId: string;
  missingFromMs: number;
  missingToMs: number;
  requestedAt: string;
  reason: 'egress_gap' | 'egress_corrupt';
};

export type RecoverySegment = {
  id: string;
  sessionId: string;
  sequence: number;
  startedAtMs: number;
  endedAtMs: number;
  mimeType: string;
  byteLength: number;
  sha256: string;
  localUri: string;
};

export type CaptureSnapshot = {
  state: CaptureState;
  connection: ConnectionState;
  sessionId: string;
  facingMode: FacingMode;
  orientation: DeviceOrientation;
  audioRoute: 'unknown' | 'bluetooth' | 'wired' | 'phone' | 'unavailable';
  guidanceAudioActive: boolean;
  egressHealthy: boolean;
  recoveryPending: number;
  error?: string;
};

export type CaptureSessionConfig = {
  serverUrl: string;
  tokenEndpoint: string;
  companyId: string;
  memberId: string;
  workflowId: string;
  sessionId: string;
  apiRequest?: typeof fetch;
};
