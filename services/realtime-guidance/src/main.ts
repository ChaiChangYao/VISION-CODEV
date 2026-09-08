import 'dotenv/config';

import { GuidanceApiClient, type GuidanceIdentity } from './apiClient.js';
import {
  FrameDifferenceDetector,
  HttpChangeDetector,
  type ChangeDetector,
} from './changeDetection.js';
import { ChangeTriggeredGuidancePipeline } from './changeTriggeredPipeline.js';
import { uncertainObservation } from './contracts.js';
import {
  HttpEventVlmProvider,
  SingleFrameEventVlmProvider,
  type EventVlmProvider,
} from './eventVlm.js';
import { LiveKitGuidanceTransport } from './livekitTransport.js';
import { RealtimeGuidancePipeline } from './pipeline.js';
import { FixtureVlmProvider, HttpVlmProvider, type VlmProvider } from './vlm.js';

async function main(): Promise<void> {
  const apiBaseUrl = required('API_URL').replace(/\/$/, '');
  const identity: GuidanceIdentity = {
    companyId: required('NEXT_PUBLIC_COMPANY_ID'),
    memberId: required('NEXT_PUBLIC_MEMBER_ID'),
    workflowId: required('VISION_CODEF_WORKFLOW_ID'),
    deploymentId: required('VISION_CODEF_DEPLOYMENT_ID'),
  };
  const api = new GuidanceApiClient(
    apiBaseUrl,
    identity,
    required('VISION_CODEF_GUIDANCE_SERVICE_SECRET'),
    process.env.VISION_CODEF_API_BEARER_TOKEN,
  );
  const connection = await api.connection();
  const provider = createProvider();
  const transport = new LiveKitGuidanceTransport({
    frameIntervalMs: positiveInteger(process.env.VISION_CODEF_GUIDANCE_FRAME_INTERVAL_MS, 500),
    onError: reportError,
  });
  const evaluator = {
    evaluate: (observation: Parameters<typeof api.evaluate>[1]) =>
      api.evaluate(connection.observationPath, observation),
  };
  const detector = createChangeDetector(identity.deploymentId);
  const pipeline = detector
    ? new ChangeTriggeredGuidancePipeline(
        detector,
        createEventProvider(provider),
        evaluator,
        transport,
        identity,
        {
          preRollMs: nonnegativeInteger(process.env.VISION_CODEF_CHANGE_PRE_ROLL_MS, 2000),
          postRollMs: nonnegativeInteger(process.env.VISION_CODEF_CHANGE_POST_ROLL_MS, 1000),
          cooldownMs: nonnegativeInteger(process.env.VISION_CODEF_CHANGE_COOLDOWN_MS, 2000),
          maxEvidenceFrames: positiveInteger(
            process.env.VISION_CODEF_CHANGE_MAX_EVIDENCE_FRAMES,
            8,
          ),
          onError: reportError,
        },
      )
    : new RealtimeGuidancePipeline(provider, evaluator, transport, identity, {
        onError: reportError,
      });

  await transport.start(connection, (frame) => void pipeline.pushFrame(frame));
  console.log(`Realtime guidance joined ${connection.roomName}.`);

  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  if ('flush' in pipeline) await pipeline.flush();
  await transport.stop();
}

function createProvider(): VlmProvider {
  const endpoint = process.env.VISION_CODEF_VLM_ENDPOINT?.trim();
  if (endpoint) return new HttpVlmProvider(endpoint, process.env.VISION_CODEF_VLM_BEARER_TOKEN);
  const configured = process.env.VISION_CODEF_FIXTURE_OBSERVATION_JSON;
  return new FixtureVlmProvider(configured ? JSON.parse(configured) : uncertainObservation(0));
}

function createEventProvider(fallback: VlmProvider): EventVlmProvider {
  const endpoint = process.env.VISION_CODEF_EVENT_VLM_ENDPOINT?.trim();
  return endpoint
    ? new HttpEventVlmProvider(endpoint, process.env.VISION_CODEF_EVENT_VLM_BEARER_TOKEN)
    : new SingleFrameEventVlmProvider(fallback);
}

function createChangeDetector(streamId: string): ChangeDetector | undefined {
  const mode = process.env.VISION_CODEF_CHANGE_DETECTOR?.trim().toLowerCase() ?? 'disabled';
  if (mode === 'disabled') return undefined;
  if (mode === 'frame-difference') {
    return new FrameDifferenceDetector({
      threshold: finiteNumber(process.env.VISION_CODEF_CHANGE_THRESHOLD, 0.12),
      consecutiveFrames: positiveInteger(process.env.VISION_CODEF_CHANGE_CONSECUTIVE_FRAMES, 2),
    });
  }
  if (mode === 'http') {
    return new HttpChangeDetector({
      endpoint: required('VISION_CODEF_CHANGE_DETECTOR_ENDPOINT'),
      detectorId: process.env.VISION_CODEF_CHANGE_DETECTOR_MODEL_ID?.trim() || 'streamformer',
      detectorVersion: process.env.VISION_CODEF_CHANGE_DETECTOR_MODEL_VERSION?.trim() || 'unknown',
      streamId,
      bearerToken: process.env.VISION_CODEF_CHANGE_DETECTOR_BEARER_TOKEN,
    });
  }
  throw new Error('VISION_CODEF_CHANGE_DETECTOR must be disabled, frame-difference, or http.');
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonnegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function finiteNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function reportError(error: unknown): void {
  console.error('Realtime guidance error:', error instanceof Error ? error.message : String(error));
}

void main().catch((error) => {
  reportError(error);
  process.exitCode = 1;
});
