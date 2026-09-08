export type LumaFrame = { timestampMs: number; pixels: Uint8Array };

export type ChangeEvent = {
  index: number;
  startMs: number;
  keyframeMs: number;
  endMs: number;
  changeScore: number;
};

export type ChangeDetectionOptions = {
  minimumScore?: number;
  minimumSpacingMs?: number;
  preRollMs?: number;
  postRollMs?: number;
  maximumEvents?: number;
};

/**
 * Finds bounded change events from uniformly sampled grayscale frames. The adaptive
 * threshold rejects sensor noise while the spacing rule collapses one physical
 * action into one semantic evidence window.
 */
export function detectChangeEvents(
  frames: readonly LumaFrame[],
  durationMs: number,
  options: ChangeDetectionOptions = {},
): ChangeEvent[] {
  if (frames.length < 2) return [];
  const scored = frames.slice(1).map((frame, index) => ({
    timestampMs: frame.timestampMs,
    score: meanAbsoluteDifference(frames[index]!.pixels, frame.pixels),
  }));
  const values = scored.map((item) => item.score);
  const baseline = median(values);
  const deviation = median(values.map((value) => Math.abs(value - baseline)));
  // Handheld recordings have a high motion baseline. A conservative 3× MAD
  // threshold only finds hard cuts, so use a modest robust uplift and let the
  // semantic model reject camera-only peaks.
  const threshold = Math.max(options.minimumScore ?? 0.035, baseline + Math.max(0.008, 0.75 * deviation));
  const candidates = scored.filter((item, index) => {
    if (item.score < threshold) return false;
    return item.score >= (scored[index - 1]?.score ?? -1) && item.score >= (scored[index + 1]?.score ?? -1);
  });
  const minimumSpacingMs = options.minimumSpacingMs ?? 1800;
  const selected: typeof candidates = [];
  for (const candidate of candidates.sort((left, right) => right.score - left.score)) {
    if (selected.every((item) => Math.abs(item.timestampMs - candidate.timestampMs) >= minimumSpacingMs)) {
      selected.push(candidate);
    }
  }
  const maximumEvents = options.maximumEvents ?? 12;
  const preRollMs = options.preRollMs ?? 1500;
  const postRollMs = options.postRollMs ?? 1500;
  return selected
    .slice(0, maximumEvents)
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .map((item, index) => ({
      index,
      startMs: Math.max(0, item.timestampMs - preRollMs),
      keyframeMs: item.timestampMs,
      endMs: Math.max(item.timestampMs + 1, Math.min(durationMs, item.timestampMs + postRollMs)),
      changeScore: item.score,
    }));
}

export function decodeLumaFrames(
  bytes: Uint8Array,
  width: number,
  height: number,
  sampleFps: number,
): LumaFrame[] {
  const frameBytes = width * height;
  if (frameBytes <= 0 || sampleFps <= 0) throw new Error('Invalid luma frame geometry.');
  const frameCount = Math.floor(bytes.byteLength / frameBytes);
  return Array.from({ length: frameCount }, (_, index) => ({
    timestampMs: Math.round(index * 1000 / sampleFps),
    pixels: bytes.slice(index * frameBytes, (index + 1) * frameBytes),
  }));
}

function meanAbsoluteDifference(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Math.abs(left[index]! - right[index]!);
  return total / length / 255;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
