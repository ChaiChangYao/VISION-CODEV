import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { ProcedureGraphSchema } from '@vision-codef/contracts';
import {
  ATOMIC_VERSION,
  analysisCacheKey,
  analyzeAtomicWindow,
  atomicWrite,
  planAnalysisWindows,
  runAtomicWindows,
  type AnalysisWindow,
} from './atomic-analysis.js';
import { withApiBudget } from './api-budget.js';
import { transcriptForWindow, type TimestampedTranscript } from './transcription-provider.js';
import type { VisionProviderConfig } from './vision-provider.js';
const exec = promisify(execFile);
export async function mediaHash(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function inspectMedia(path: string) {
  if (!ffmpeg) throw new Error('FFmpeg unavailable.');
  // Decode the entire stream: validates readability, measures duration and detects silent tracks.
  const { stderr } = await exec(
    ffmpeg,
    ['-hide_banner', '-i', path, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
    { maxBuffer: 4 * 1024 * 1024 },
  ).catch(async (error) => {
    if (!/does not contain any stream/.test(error.stderr ?? '')) throw error;
    return exec(ffmpeg!, ['-hide_banner', '-i', path, '-an', '-f', 'null', '-'], {
      maxBuffer: 4 * 1024 * 1024,
    });
  });
  const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  if (!duration) throw new Error('Could not determine video duration.');
  const durationMs = Math.round(
    (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000,
  );
  const volume = /max_volume: ([-\d.]+) dB/.exec(stderr);
  return { durationMs, hasSound: Boolean(volume && Number(volume[1]) > -60) };
}
async function frames(path: string, dir: string, window: AnalysisWindow) {
  await mkdir(dir, { recursive: true });
  await exec(ffmpeg!, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(window.startMs / 1000),
    '-i',
    path,
    '-t',
    String((window.endMs - window.startMs) / 1000),
    '-vf',
    'fps=4:start_time=0,scale=768:-2',
    '-q:v',
    '3',
    join(dir, '%04d.jpg'),
  ]);
  const names = (await readdir(dir)).filter((name) => /^\d{4}\.jpg$/.test(name)).sort();
  return Promise.all(
    names
      .filter((_, index) => window.startMs + index * 250 < window.endMs)
      .map(async (name, index) => ({
        timestampMs: window.startMs + index * 250,
        imageBase64: (await readFile(join(dir, name))).toString('base64'),
      })),
  );
}
export async function processSeniorVideo(options: {
  path: string;
  cacheRoot: string;
  budgetPath: string;
  capUsd: number;
  config: VisionProviderConfig;
  transcript: TimestampedTranscript;
  expectedHash?: string;
  progress?: (completed: number, total: number) => Promise<void>;
}) {
  // The reservation is valid only for the documented gpt-5-mini price/context/output cap.
  if (
    options.config.provider !== 'openai' ||
    !/^gpt-5-mini(?:-2025-08-07)?$/.test(options.config.model) ||
    options.config.openaiBaseUrl.replace(/\/$/, '') !== 'https://api.openai.com/v1'
  )
    throw new Error(
      'Budgeted senior processing currently supports official OpenAI gpt-5-mini only.',
    );
  const hash = await mediaHash(options.path);
  if (options.expectedHash && hash !== options.expectedHash)
    throw new Error('Media SHA-256 mismatch.');
  const { durationMs } = await inspectMedia(options.path);
  const windows = planAnalysisWindows(durationMs);
  const cacheDir = join(
    options.cacheRoot,
    analysisCacheKey(hash, options.transcript, options.config),
  );
  const result = await runAtomicWindows(
    windows,
    cacheDir,
    async (window) => {
      const evidence = {
        ...window,
        keyframeMs: Math.round((window.startMs + window.endMs) / 2),
        changeScore: 0,
        transcript: transcriptForWindow(options.transcript, window.startMs, window.endMs),
        frames: await frames(options.path, join(cacheDir, `frames-${window.index}`), window),
      };
      return withApiBudget(
        options.budgetPath,
        options.capUsd,
        `${hash}:${window.index}`,
        () => analyzeAtomicWindow(window, evidence, options.config),
        (value) =>
          value.usage
            ? (value.usage.input_tokens * 0.25 + value.usage.output_tokens * 2) / 1_000_000
            : undefined,
      );
    },
    options.progress,
  );
  const value = {
    ...result,
    pipelineVersion: ATOMIC_VERSION,
    durationMs,
    mediaSha256: hash,
    model: options.config.model,
  };
  await atomicWrite(join(cacheDir, 'result.json'), value);
  return value;
}
export type SeniorResult = Awaited<ReturnType<typeof processSeniorVideo>>;
export function seniorGraph(result: SeniorResult) {
  const states = Array.from({ length: result.actions.length + 1 }, (_, index) => ({
    id: randomUUID(),
    label: index === 0 ? 'Recording begins' : `After observation ${index}`,
    predicates: [],
  }));
  return ProcedureGraphSchema.parse({
    id: randomUUID(),
    version: 1,
    published: false,
    analysis: {
      version: ATOMIC_VERSION,
      durationMs: result.durationMs,
      windowsCompleted: result.windowsCompleted,
      windowsTotal: result.windowsTotal,
      mediaSha256: result.mediaSha256,
      model: result.model,
    },
    states,
    steps: result.actions.map((action, index) => ({
      id: randomUUID(),
      ordinalHint: index,
      title: action.title,
      instruction: action.observedAction,
      observedAction: action.observedAction,
      evidenceRefs: [],
      provenance: ['MODEL_INFERENCE'],
      startState: [states[index]!.id],
      endState: [states[index + 1]!.id],
      expectedAction: [],
      allowableVariations: [],
      deviationRules: [],
      recoveryTransitions: [],
      confidence: 0,
      evidenceStartMs: action.startMs,
      evidenceEndMs: action.endMs,
      keyframeMs: Math.round((action.startMs + action.endMs) / 2),
      seniorReview: {
        reviewed: false,
        object: action.object,
        hand: action.hand,
        beforeState: action.beforeState,
        afterState: action.afterState,
        uncertainty: action.uncertainty,
        group: action.group,
        reasoning: '',
        completionCheck: '',
        documentReferences: '',
      },
    })),
  });
}
