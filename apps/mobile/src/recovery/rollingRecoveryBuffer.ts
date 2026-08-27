import type { RecoveryRequest, RecoverySegment } from '../types';

export type RecoveryBufferStore = {
  put(segment: RecoverySegment, bytes: Uint8Array): Promise<void>;
  remove(segment: RecoverySegment): Promise<void>;
};

export type RecoveryUpload = {
  segment: RecoverySegment;
  bytes: Uint8Array;
};

export type RecoveryBufferOptions = {
  maxDurationMs: number;
  maxBytes: number;
  store?: RecoveryBufferStore;
};

const defaultOptions: RecoveryBufferOptions = {
  maxDurationMs: 30_000,
  maxBytes: 12 * 1024 * 1024,
};

/**
 * Keeps a small local recovery window without competing with LiveKit Egress.
 *
 * Segments are never uploaded from append(). The server must explicitly request
 * a missing Egress interval before drainForRequest() returns bytes for upload.
 */
export class RollingRecoveryBuffer {
  private readonly options: RecoveryBufferOptions;
  private readonly segments: RecoverySegment[] = [];
  private readonly bytesById = new Map<string, Uint8Array>();

  constructor(options: Partial<RecoveryBufferOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  async append(segment: RecoverySegment, bytes: Uint8Array): Promise<void> {
    if (segment.byteLength !== bytes.byteLength) {
      throw new Error('Recovery segment byteLength does not match payload length');
    }

    this.segments.push(segment);
    this.segments.sort((left, right) => left.startedAtMs - right.startedAtMs);
    this.bytesById.set(segment.id, bytes);
    await this.options.store?.put(segment, bytes);
    await this.trim(segment.endedAtMs);
  }

  list(): readonly RecoverySegment[] {
    return [...this.segments];
  }

  get durationMs(): number {
    const first = this.segments[0];
    const last = this.segments.at(-1);
    return first && last ? Math.max(0, last.endedAtMs - first.startedAtMs) : 0;
  }

  get byteLength(): number {
    return this.segments.reduce((total, segment) => total + segment.byteLength, 0);
  }

  async drainForRequest(request: RecoveryRequest): Promise<RecoveryUpload[]> {
    return this.segments
      .filter(
        (segment) =>
          segment.sessionId === request.sessionId &&
          segment.endedAtMs > request.missingFromMs &&
          segment.startedAtMs < request.missingToMs,
      )
      .map((segment) => ({ segment, bytes: this.bytesById.get(segment.id) }))
      .filter((upload): upload is RecoveryUpload => upload.bytes !== undefined)
      .sort((left, right) => left.segment.sequence - right.segment.sequence);
  }

  async acknowledgeReconciled(segmentIds: readonly string[]): Promise<void> {
    const acknowledged = new Set(segmentIds);
    const retained = this.segments.filter((segment) => !acknowledged.has(segment.id));
    for (const segment of this.segments) {
      if (acknowledged.has(segment.id)) {
        await this.options.store?.remove(segment);
        this.bytesById.delete(segment.id);
      }
    }
    this.segments.splice(0, this.segments.length, ...retained);
  }

  private async trim(nowMs: number): Promise<void> {
    while (
      this.segments.length > 0 &&
      (this.durationMs > this.options.maxDurationMs || this.byteLength > this.options.maxBytes)
    ) {
      const oldest = this.segments.shift();
      if (!oldest) return;
      await this.options.store?.remove(oldest);
      this.bytesById.delete(oldest.id);
    }

    // A segment with a future timestamp should not keep the rolling window alive forever.
    while (this.segments[0] && this.segments[0].endedAtMs < nowMs - this.options.maxDurationMs) {
      const oldest = this.segments.shift();
      if (!oldest) return;
      await this.options.store?.remove(oldest);
      this.bytesById.delete(oldest.id);
    }
  }
}
