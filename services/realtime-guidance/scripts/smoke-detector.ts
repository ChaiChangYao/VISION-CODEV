import { HttpChangeDetector } from '../src/changeDetection.js';
import type { FrameSample } from '../src/contracts.js';

const endpoint =
  process.env.VISION_CODEF_CHANGE_DETECTOR_ENDPOINT ?? 'http://127.0.0.1:8091/detect';
const detector = new HttpChangeDetector({
  endpoint,
  detectorId: 'streamformer',
  detectorVersion: 'smoke',
  streamId: `smoke-${Date.now()}`,
});

const results = [];
for (let sequence = 0; sequence < 20; sequence += 1) {
  const value = sequence < 16 ? 0 : 255;
  const pixel = [value, value, value, 255];
  const frame: FrameSample = {
    data: new Uint8Array([...pixel, ...pixel, ...pixel, ...pixel]),
    width: 2,
    height: 2,
    pixelFormat: 'rgba',
    timestampMs: sequence * 125,
    participantIdentity: 'smoke-phone',
  };
  results.push(await detector.observe(frame));
}

const triggers = results.filter((result) => result.changed);
const inferred = results.filter(
  (result) => result.metadata?.warmupFrames === 0 && result.metadata?.skippedInference === false,
);
if (inferred.length < 3) {
  throw new Error(`Expected at least three inference windows, received ${inferred.length}.`);
}
const detectorId = results.at(-1)?.detectorId;
if (detectorId === 'statistical-temporal-baseline' && triggers.length !== 1) {
  throw new Error(`Expected one statistical-baseline trigger, received ${triggers.length}.`);
}
console.log(
  JSON.stringify(
    {
      frames: results.length,
      inferenceWindows: inferred.length,
      triggerTimestampsMs: triggers.map((result) => result.timestampMs),
      detectorId,
      maximumScore: Math.max(...results.map((result) => result.score)),
      lastInferenceMetadata: inferred.at(-1)?.metadata,
    },
    null,
    2,
  ),
);
