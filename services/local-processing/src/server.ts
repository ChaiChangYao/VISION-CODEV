import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ProcedureGraphSchema, type ProcedureGraph } from '@vision-codef/contracts';
import ffmpegPath from 'ffmpeg-static';
import { analyzeWithVisionProvider, visionProviderConfig, type EvidenceWindowInput, type ModelObservationResult } from './vision-provider.js';
import { transcribeWithOpenAI, transcriptForWindow, type TimestampedTranscript } from './transcription-provider.js';
import { decodeLumaFrames, detectChangeEvents, type ChangeEvent } from './video-events.js';
import { ATOMIC_VERSION } from './atomic-analysis.js';
import { inspectMedia, processSeniorVideo, seniorGraph, type SeniorResult } from './senior-processing.js';
import { withApiBudget } from './api-budget.js';

const run = promisify(execFile);
const port = Number(process.env.VISION_CODEF_LOCAL_PROCESSING_PORT ?? 8092);
const bucket = process.env.S3_BUCKET ?? 'vision-codef';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workRoot = resolve(process.env.VISION_CODEF_PROCESSING_WORK_DIR ?? join(projectRoot, '.run', 'local-processing'));
const vision = visionProviderConfig();
const model = vision.model;
const processingPipelineVersion = 'timestamped-events-v2';
const detectionWidth = 160;
const detectionHeight = 90;
const detectionFps = 2;
const evidenceFramesPerEvent = 8;
const budgetPath = join(workRoot, 'senior-api-budget.json');
const budgetCap = Math.min(10, Number(process.env.VISION_CODEF_SENIOR_BUDGET_USD ?? 10));
const active = new Map<string, Promise<unknown>>();
const observationFailures = new Map<string, unknown>();
const progress = new Map<string, { completed: number; total: number }>();

const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'us-east-1',
  endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'change-me',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'change-me-secret',
  },
});

type ProviderInput = {
  companyId: string;
  workflowId: string;
  captureSessionId: string;
  media: { companyId: string; objectKey: string; sha256?: string };
};

type ObservationStep = {
  title: string;
  instruction: string;
  observedAction: string;
  expectedAction: string[];
  endState: string;
  allowableVariations: string[];
  deviationRules: string[];
  confidence: number;
  evidenceStartMs: number;
  evidenceEndMs: number;
  keyframeMs: number;
  transcriptExcerpt: string;
  changeScore: number;
};

type ObservationResult = { pipelineVersion: string; procedureVisible: boolean; screenDominates: boolean; physicalActionFrameCount: number; summary: string; steps: ObservationStep[] };
class InsufficientVisualEvidenceError extends Error {}

function send(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ data }));
}

async function json(request: IncomingMessage): Promise<ProviderInput> {
  let body = '';
  for await (const chunk of request) body += chunk;
  const value = JSON.parse(body || '{}') as ProviderInput;
  if (!value.companyId || !value.workflowId || !value.captureSessionId || !value.media?.objectKey) {
    throw new Error('Incomplete processing request.');
  }
  if (![value.companyId, value.workflowId, value.captureSessionId].every((id) => /^[a-zA-Z0-9_-]+$/.test(id))) throw new Error('Invalid processing identifier.');
  if (value.media.companyId !== value.companyId || !value.media.objectKey.startsWith(`companies/${value.companyId}/`)) {
    throw new Error('Media reference is outside the requesting company boundary.');
  }
  return value;
}

function artifact(input: ProviderInput, kind: 'media' | 'transcript' | 'observations' | 'procedure-draft') {
  const suffix = kind === 'media' ? 'egress.mp4' : `${kind}.json`;
  return {
    companyId: input.companyId,
    objectKey: kind === 'media' ? input.media.objectKey : `companies/${input.companyId}/captures/${input.captureSessionId}/processing/${suffix}`,
    kind,
  };
}

function sessionDir(input: ProviderInput) {
  return join(workRoot, input.companyId, input.captureSessionId);
}

async function persistJson(input: ProviderInput, kind: 'transcript' | 'observations' | 'procedure-draft', value: unknown) {
  const body = JSON.stringify(value, null, 2);
  const reference = artifact(input, kind);
  await writeFile(join(sessionDir(input), `${kind}.json`), body);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: reference.objectKey, Body: body, ContentType: 'application/json' }));
  return reference;
}

async function downloadMedia(input: ProviderInput): Promise<string> {
  const target = join(sessionDir(input), 'egress.mp4');
  try { await stat(target); if (!input.media.sha256 || await sha256File(target) === input.media.sha256) return target; } catch { /* Download below. */ }
  await mkdir(dirname(target), { recursive: true });
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: input.media.objectKey }));
  if (!response.Body) throw new Error('The canonical MP4 could not be read from MinIO.');
  const temporary = `${target}.${randomUUID()}.download`;
  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(temporary));
  if (input.media.sha256 && await sha256File(temporary) !== input.media.sha256) throw new Error('Downloaded MP4 SHA-256 mismatch.');
  await rename(temporary, target);
  return target;
}

async function detectEvents(videoPath: string): Promise<{ events: ChangeEvent[]; durationMs: number }> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary for this platform.');
  const bytes = await runBinary(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', videoPath, '-vf', `fps=${detectionFps},scale=${detectionWidth}:${detectionHeight},format=gray`, '-f', 'rawvideo', 'pipe:1']);
  const frames = decodeLumaFrames(bytes, detectionWidth, detectionHeight, detectionFps);
  const durationMs = Math.max(1, Math.round(frames.length * 1000 / detectionFps));
  const events = detectChangeEvents(frames, durationMs);
  if (events.length > 0) return { events, durationMs };
  const keyframeMs = Math.max(0, Math.round(durationMs / 2));
  return { events: [{ index: 0, startMs: Math.max(0, keyframeMs - 2000), keyframeMs, endMs: Math.min(durationMs, keyframeMs + 2000), changeScore: 0 }], durationMs };
}

async function extractEvidenceWindow(videoPath: string, outputDir: string, event: ChangeEvent): Promise<EvidenceWindowInput['frames']> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary for this platform.');
  await mkdir(outputDir, { recursive: true });
  const durationSeconds = Math.max(0.25, (event.endMs - event.startMs) / 1000);
  const prefix = `event-${String(event.index).padStart(2, '0')}`;
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', (event.startMs / 1000).toFixed(3), '-i', videoPath, '-t', durationSeconds.toFixed(3), '-vf', `fps=${evidenceFramesPerEvent / durationSeconds},scale=512:-2`, '-frames:v', String(evidenceFramesPerEvent), '-q:v', '3', join(outputDir, `${prefix}-%02d.jpg`)]);
  const paths = (await readdir(outputDir)).filter((name) => new RegExp(`^${prefix}-\\d+\\.jpg$`).test(name)).sort().slice(0, evidenceFramesPerEvent);
  return Promise.all(paths.map(async (name, index) => ({
    timestampMs: Math.round(event.startMs + (index * (event.endMs - event.startMs)) / Math.max(1, paths.length - 1)),
    imageBase64: (await readFile(join(outputDir, name))).toString('base64'),
  })));
}

async function extractAudio(videoPath: string, audioPath: string): Promise<boolean> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary for this platform.');
  try {
    await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath, '-map', '0:a:0?', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audioPath]);
    return (await stat(audioPath)).size > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/does not contain any stream|matches no streams|audio/i.test(message)) return false;
    throw error;
  }
}

async function runBinary(command: string, args: string[]): Promise<Uint8Array> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 }, (error, stdout) => {
      if (error) rejectPromise(error);
      else resolvePromise(new Uint8Array(stdout));
    });
  });
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function reusableObservations(input: ProviderInput, videoPath: string): Promise<ObservationResult | undefined> {
  const mediaHash = input.media.sha256;
  if (!mediaHash) return undefined;
  const cacheDir = join(workRoot, 'cache');
  const cacheNamespace = `${processingPipelineVersion}-${vision.provider}-${vision.model}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const cachePath = join(cacheDir, `${cacheNamespace}-${mediaHash}.observations.json`);
  try { return JSON.parse(await readFile(cachePath, 'utf8')) as ObservationResult; } catch { /* Search prior successful sessions. */ }
  if (vision.provider !== 'ollama') {
    if (await sha256File(videoPath) !== mediaHash) throw new Error('Downloaded media does not match its verified SHA-256.');
    return undefined;
  }
  const companyRoot = join(workRoot, input.companyId);
  let entries;
  try { entries = await readdir(companyRoot, { withFileTypes: true }); } catch { return undefined; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === input.captureSessionId) continue;
    const candidateVideo = join(companyRoot, entry.name, 'egress.mp4');
    const candidateObservations = join(companyRoot, entry.name, 'observations.json');
    try {
      if (await sha256File(candidateVideo) !== mediaHash) continue;
      const observations = JSON.parse(await readFile(candidateObservations, 'utf8')) as ObservationResult;
      if (observations.pipelineVersion !== processingPipelineVersion || !Array.isArray(observations.steps) || observations.steps.length === 0) continue;
      await mkdir(cacheDir, { recursive: true });
      await writeFile(cachePath, JSON.stringify(observations, null, 2));
      return observations;
    } catch { /* This prior session is not a reusable successful result. */ }
  }
  if (await sha256File(videoPath) !== mediaHash) throw new Error('Downloaded media does not match its verified SHA-256.');
  return undefined;
}

async function analyzeEvents(videoPath: string, transcript: TimestampedTranscript): Promise<ObservationResult> {
  const { events } = await detectEvents(videoPath);
  const windows: EvidenceWindowInput[] = [];
  for (const event of events) {
    const frames = await extractEvidenceWindow(videoPath, join(dirname(videoPath), 'event-frames-v2'), event);
    if (frames.length < 6) continue;
    windows.push({ ...event, transcript: transcriptForWindow(transcript, event.startMs, event.endMs), frames });
  }
  if (windows.length === 0) throw new Error('No bounded evidence windows could be extracted from the recording.');
  const results: ModelObservationResult[] = [];
  for (let index = 0; index < windows.length; index += 4) results.push(await analyzeWithVisionProvider(windows.slice(index, index + 4), vision));
  const steps: ObservationStep[] = [];
  const usedEvents = new Set<number>();
  for (const result of results) {
    for (const step of result.steps ?? []) {
      const event = windows.find((window) => window.index === Number(step.eventIndex));
      if (!event || usedEvents.has(event.index)) continue;
      usedEvents.add(event.index);
      steps.push({
        title: String(step.title || `Step ${steps.length + 1}`),
        instruction: String(step.observedAction || `Perform step ${steps.length + 1}.`),
        observedAction: String(step.observedAction || step.title || `Action ${steps.length + 1}`),
        expectedAction: [String(step.observedAction || step.title || `step ${steps.length + 1}`)],
        endState: String(step.endState || `Step ${steps.length + 1} complete`),
        allowableVariations: [],
        deviationRules: [`The result does not match: ${String(step.endState || `step ${steps.length + 1} complete`)}`],
        confidence: Math.max(0, Math.min(1, Number(step.confidence ?? 0.6))),
        evidenceStartMs: event.startMs,
        evidenceEndMs: event.endMs,
        keyframeMs: event.keyframeMs,
        transcriptExcerpt: event.transcript,
        changeScore: event.changeScore,
      });
    }
  }
  steps.sort((left, right) => left.keyframeMs - right.keyframeMs);
  if (steps.length === 0) throw new InsufficientVisualEvidenceError(`No physical procedure is visible in the detected change windows. ${results.map((result) => result.summary).filter(Boolean).join(' ')}`.trim());
  return {
    pipelineVersion: processingPipelineVersion,
    procedureVisible: true,
    screenDominates: results.every((result) => result.screenDominates === true),
    physicalActionFrameCount: results.reduce((total, result) => total + Number(result.physicalActionFrameCount || 0), 0),
    summary: results.map((result) => result.summary).filter(Boolean).join(' '),
    steps,
  };
}

function graphFromObservations(observations: ObservationResult): ProcedureGraph {
  const graphId = randomUUID();
  const stateIds = Array.from({ length: observations.steps.length + 1 }, () => randomUUID());
  const stepIds = observations.steps.map(() => randomUUID());
  return ProcedureGraphSchema.parse({
    id: graphId,
    version: 1,
    published: false,
    states: stateIds.map((id, index) => ({ id, label: index === 0 ? 'Ready to begin' : observations.steps[index - 1]!.endState, predicates: index === 0 ? ['workspace visible'] : [observations.steps[index - 1]!.endState] })),
    steps: observations.steps.map((step, index) => ({
      id: stepIds[index],
      ordinalHint: index,
      title: step.title,
      instruction: step.instruction,
      observedAction: step.observedAction,
      evidenceRefs: [],
      provenance: ['MODEL_INFERENCE', 'SENSOR_OBSERVATION'],
      startState: [stateIds[index]],
      expectedAction: step.expectedAction,
      endState: [stateIds[index + 1]],
      allowableVariations: step.allowableVariations,
      deviationRules: step.deviationRules,
      recoveryTransitions: index > 0 ? [stepIds[index - 1]] : [],
      confidence: step.confidence,
      evidenceStartMs: step.evidenceStartMs,
      evidenceEndMs: step.evidenceEndMs,
      keyframeMs: step.keyframeMs,
      transcriptExcerpt: step.transcriptExcerpt || undefined,
    })),
  });
}

async function route(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'GET' && request.url === '/health') return send(response, vision.provider === 'openai' && !vision.openaiApiKey ? 503 : 200, { status: vision.provider === 'openai' && !vision.openaiApiKey ? 'unavailable' : 'ok', provider: vision.provider, model, configured: vision.provider === 'ollama' || Boolean(vision.openaiApiKey) });
  if (request.method !== 'POST') return send(response, 404, { error: 'Not found.' });
  const input = await json(request);
  const endpoint = request.url?.split('/').filter(Boolean).at(-1);
  if (endpoint === 'progress') return send(response, 200, progress.get(`${input.companyId}/${input.captureSessionId}`) ?? { completed: 0, total: 0 });
  if (endpoint === 'finalize') {
    await downloadMedia(input);
    return send(response, 200, artifact(input, 'media'));
  }
  if (endpoint === 'transcribe') {
    const transcriptPath = join(sessionDir(input), 'transcript.json');
    try { await readFile(transcriptPath, 'utf8'); } catch {
      const video = await downloadMedia(input);
      const audioPath = join(sessionDir(input), 'speech.mp3');
      const info = await inspectMedia(video);
      const hasAudio = info.hasSound && await extractAudio(video, audioPath);
      const transcript = hasAudio
        ? await withApiBudget(budgetPath, budgetCap, `${input.captureSessionId}:speech`, () => transcribeWithOpenAI(audioPath, { apiKey: vision.openaiApiKey, baseUrl: vision.openaiBaseUrl, model: 'whisper-1' }), () => undefined, Math.ceil(info.durationMs / 60_000) * 0.006 + 0.006)
        : { text: '', status: 'no-audio' as const, segments: [] };
      await persistJson(input, 'transcript', transcript);
    }
    return send(response, 200, artifact(input, 'transcript'));
  }
  if (endpoint === 'observations') {
    if (vision.provider === 'openai') {
      const key = `${input.companyId}/${input.captureSessionId}`;
      // Finished artifacts survive worker/provider restarts; never bill again just
      // because the HTTP caller disconnected before receiving the result.
      try {
        const saved = JSON.parse(await readFile(join(sessionDir(input), 'observations.json'), 'utf8'));
        if (saved.pipelineVersion === ATOMIC_VERSION)
          return send(response, 200, artifact(input, 'observations'));
      } catch { /* Missing/incomplete artifact: resume checkpointed windows below. */ }
      if (observationFailures.has(key)) {
        const failure = observationFailures.get(key);
        observationFailures.delete(key);
        throw failure;
      }
      let task = active.get(key);
      if (!task) {
        task = (async () => {
          const video = await downloadMedia(input);
          const transcript = JSON.parse(await readFile(join(sessionDir(input), 'transcript.json'), 'utf8')) as TimestampedTranscript;
          const result = await processSeniorVideo({ path: video, cacheRoot: join(workRoot, input.companyId, 'atomic-cache'), budgetPath, capUsd: budgetCap, config: vision, transcript, expectedHash: input.media.sha256, progress: async (completed, total) => { progress.set(key, { completed, total }); } });
          await persistJson(input, 'observations', result);
        })();
        active.set(key, task);
        void task.catch((error) => observationFailures.set(key, error)).finally(() => active.delete(key));
      }
      if (request.headers.prefer === 'respond-async')
        return send(response, 202, { status: 'running', ...progress.get(key) });
      await task;
      return send(response, 200, artifact(input, 'observations'));
    }
    const observationPath = join(sessionDir(input), 'observations.json');
    let current = false;
    try { current = (JSON.parse(await readFile(observationPath, 'utf8')) as ObservationResult).pipelineVersion === processingPipelineVersion; } catch { /* Rebuild below. */ }
    if (!current) {
      const video = await downloadMedia(input);
      const transcript = JSON.parse(await readFile(join(sessionDir(input), 'transcript.json'), 'utf8')) as TimestampedTranscript;
      const observations = await reusableObservations(input, video) ?? await analyzeEvents(video, transcript);
      await persistJson(input, 'observations', observations);
      if (input.media.sha256) { const cacheDir = join(workRoot, 'cache'); const cacheNamespace = `${processingPipelineVersion}-${vision.provider}-${vision.model}`.replace(/[^a-zA-Z0-9_.-]/g, '_'); await mkdir(cacheDir, { recursive: true }); await writeFile(join(cacheDir, `${cacheNamespace}-${input.media.sha256}.observations.json`), JSON.stringify(observations, null, 2)); }
    }
    return send(response, 200, artifact(input, 'observations'));
  }
  if (endpoint === 'procedure') {
    const observations = JSON.parse(await readFile(join(sessionDir(input), 'observations.json'), 'utf8')) as ObservationResult;
    const normalizedGraph = observations.pipelineVersion === ATOMIC_VERSION ? seniorGraph(observations as unknown as SeniorResult) : graphFromObservations(observations);
    await persistJson(input, 'procedure-draft', normalizedGraph);
    return send(response, 200, { ...artifact(input, 'procedure-draft'), normalizedGraph });
  }
  return send(response, 404, { error: 'Unknown processing endpoint.' });
}

createServer((request, response) => {
  void route(request, response).catch((error: unknown) => send(response, error instanceof InsufficientVisualEvidenceError ? 415 : 500, { error: error instanceof Error ? error.message : String(error) }));
}).listen(port, '0.0.0.0', () => console.log(`Vision Codef local processing listening on http://localhost:${port} with ${vision.provider}/${model}`));
