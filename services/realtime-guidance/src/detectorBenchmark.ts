import type { ChangeDetector } from './changeDetection.js';
import type { FrameSample } from './contracts.js';

export type DetectorBenchmarkReport = {
  detectorId: string;
  detectorVersion: string;
  frameCount: number;
  triggerCount: number;
  triggerTimestampsMs: number[];
  averageLatencyMs: number;
  p95LatencyMs: number;
  precision?: number;
  recall?: number;
  f1?: number;
};

export type BenchmarkOptions = {
  referenceTransitionsMs?: number[];
  matchToleranceMs?: number;
};

export async function benchmarkDetectors(
  detectors: ChangeDetector[],
  frames: FrameSample[],
  options: BenchmarkOptions = {},
): Promise<DetectorBenchmarkReport[]> {
  const reports: DetectorBenchmarkReport[] = [];
  for (const detector of detectors) {
    await detector.reset();
    const latencies: number[] = [];
    const triggers: number[] = [];
    for (const frame of frames) {
      const result = await detector.observe(frame);
      latencies.push(result.latencyMs);
      if (result.changed) triggers.push(result.timestampMs);
    }
    const sortedLatencies = [...latencies].sort((left, right) => left - right);
    const report: DetectorBenchmarkReport = {
      detectorId: detector.id,
      detectorVersion: detector.version,
      frameCount: frames.length,
      triggerCount: triggers.length,
      triggerTimestampsMs: triggers,
      averageLatencyMs: average(latencies),
      p95LatencyMs: percentile(sortedLatencies, 0.95),
    };
    if (options.referenceTransitionsMs) {
      Object.assign(
        report,
        scoreTriggers(triggers, options.referenceTransitionsMs, options.matchToleranceMs ?? 1000),
      );
    }
    reports.push(report);
  }
  return reports;
}

function scoreTriggers(triggers: number[], references: number[], toleranceMs: number) {
  const unmatched = new Set(references.map((_, index) => index));
  let truePositives = 0;
  for (const trigger of triggers) {
    let bestIndex: number | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const index of unmatched) {
      const distance = Math.abs(trigger - (references[index] ?? 0));
      if (distance <= toleranceMs && distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    }
    if (bestIndex !== undefined) {
      unmatched.delete(bestIndex);
      truePositives += 1;
    }
  }
  const precision = triggers.length === 0 ? 0 : truePositives / triggers.length;
  const recall = references.length === 0 ? 1 : truePositives / references.length;
  return {
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
  };
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: number[], quantile: number): number {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.ceil(sortedValues.length * quantile) - 1] ?? 0;
}
