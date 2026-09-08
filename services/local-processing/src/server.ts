import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ProcedureGraphSchema, type ProcedureGraph } from '@vision-codef/contracts';
import ffmpegPath from 'ffmpeg-static';
import { analyzeWithVisionProvider, visionProviderConfig, type ModelObservationResult } from './vision-provider.js';

const run = promisify(execFile);
const port = Number(process.env.VISION_CODEF_LOCAL_PROCESSING_PORT ?? 8092);
const bucket = process.env.S3_BUCKET ?? 'vision-codef';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workRoot = resolve(process.env.VISION_CODEF_PROCESSING_WORK_DIR ?? join(projectRoot, '.run', 'local-processing'));
const vision = visionProviderConfig();
const model = vision.model;

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
};

type ObservationResult = { procedureVisible: boolean; screenDominates: boolean; physicalActionFrameCount: number; summary: string; steps: ObservationStep[] };
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
  try { await readFile(target); return target; } catch { /* Download below. */ }
  await mkdir(dirname(target), { recursive: true });
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: input.media.objectKey }));
  if (!response.Body) throw new Error('The canonical MP4 could not be read from MinIO.');
  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(target));
  return target;
}

async function extractFrames(videoPath: string, outputDir: string): Promise<string[]> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary for this platform.');
  await mkdir(outputDir, { recursive: true });
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', videoPath, '-vf', 'fps=1/6,scale=320:-2', '-frames:v', '5', '-q:v', '3', join(outputDir, 'sample-%02d.jpg')]);
  return (await readdir(outputDir)).filter((name) => /^sample-\d+\.jpg$/.test(name)).sort().slice(0, 5).map((name) => join(outputDir, name));
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
  const cacheNamespace = `${vision.provider}-${vision.model}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
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
      if (!Array.isArray(observations.steps) || observations.steps.length === 0) continue;
      await mkdir(cacheDir, { recursive: true });
      await writeFile(cachePath, JSON.stringify(observations, null, 2));
      return observations;
    } catch { /* This prior session is not a reusable successful result. */ }
  }
  if (await sha256File(videoPath) !== mediaHash) throw new Error('Downloaded media does not match its verified SHA-256.');
  return undefined;
}

async function analyzeFrames(paths: string[]): Promise<ObservationResult> {
  if (paths.length === 0) throw new Error('No representative frames could be extracted from the recording.');
  const images = await Promise.all(paths.map(async (path) => (await readFile(path)).toString('base64')));
  const parsed: ModelObservationResult = await analyzeWithVisionProvider(images, vision);
  if (parsed.procedureVisible !== true || parsed.screenDominates !== false || Number(parsed.physicalActionFrameCount) < 2 || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new InsufficientVisualEvidenceError(`No physical procedure is visible in the sampled frames. ${String(parsed.summary ?? '').trim()}`.trim());
  }
  return {
    procedureVisible: true,
    screenDominates: false,
    physicalActionFrameCount: Number(parsed.physicalActionFrameCount),
    summary: String(parsed.summary ?? 'Expert procedure observed.'),
    steps: parsed.steps.slice(0, 8).map((step, index) => ({
      title: String(step.title || `Step ${index + 1}`),
      instruction: String(step.observedAction || `Perform step ${index + 1}.`),
      observedAction: String(step.observedAction || `Action observed in frame sequence ${index + 1}.`),
      expectedAction: [String(step.observedAction || step.title || `step ${index + 1}`)],
      endState: String(step.endState || `Step ${index + 1} complete`),
      allowableVariations: [],
      deviationRules: [`The result does not match: ${String(step.endState || `step ${index + 1} complete`)}`],
      confidence: Math.max(0, Math.min(1, Number(step.confidence ?? 0.6))),
    })),
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
    })),
  });
}

async function route(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'GET' && request.url === '/health') return send(response, vision.provider === 'openai' && !vision.openaiApiKey ? 503 : 200, { status: vision.provider === 'openai' && !vision.openaiApiKey ? 'unavailable' : 'ok', provider: vision.provider, model, configured: vision.provider === 'ollama' || Boolean(vision.openaiApiKey) });
  if (request.method !== 'POST') return send(response, 404, { error: 'Not found.' });
  const input = await json(request);
  const endpoint = request.url?.split('/').filter(Boolean).at(-1);
  if (endpoint === 'finalize') {
    await downloadMedia(input);
    return send(response, 200, artifact(input, 'media'));
  }
  if (endpoint === 'transcribe') {
    return send(response, 200, await persistJson(input, 'transcript', { text: '', status: 'not-configured' }));
  }
  if (endpoint === 'observations') {
    const observationPath = join(sessionDir(input), 'observations.json');
    try {
      await readFile(observationPath, 'utf8');
    } catch {
      const video = await downloadMedia(input);
      const observations = await reusableObservations(input, video) ?? await analyzeFrames(await extractFrames(video, join(sessionDir(input), 'frames')));
      await persistJson(input, 'observations', observations);
      if (input.media.sha256) { const cacheDir = join(workRoot, 'cache'); const cacheNamespace = `${vision.provider}-${vision.model}`.replace(/[^a-zA-Z0-9_.-]/g, '_'); await mkdir(cacheDir, { recursive: true }); await writeFile(join(cacheDir, `${cacheNamespace}-${input.media.sha256}.observations.json`), JSON.stringify(observations, null, 2)); }
    }
    return send(response, 200, artifact(input, 'observations'));
  }
  if (endpoint === 'procedure') {
    const observations = JSON.parse(await readFile(join(sessionDir(input), 'observations.json'), 'utf8')) as ObservationResult;
    const normalizedGraph = graphFromObservations(observations);
    await persistJson(input, 'procedure-draft', normalizedGraph);
    return send(response, 200, { ...artifact(input, 'procedure-draft'), normalizedGraph });
  }
  return send(response, 404, { error: 'Unknown processing endpoint.' });
}

createServer((request, response) => {
  void route(request, response).catch((error: unknown) => send(response, error instanceof InsufficientVisualEvidenceError ? 415 : 500, { error: error instanceof Error ? error.message : String(error) }));
}).listen(port, '0.0.0.0', () => console.log(`Vision Codef local processing listening on http://localhost:${port} with ${vision.provider}/${model}`));
