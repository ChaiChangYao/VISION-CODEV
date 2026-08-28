#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REPORT_VERSION = '0.1';
export const REPORT_STATUSES = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'];
export const EVIDENCE_SOURCES = ['physical', 'provider', 'operator'];

const PHASES = {
  4: {
    title: 'Physical phone pairing and LiveKit media proof',
    requiredHardware:
      'one physical Android phone or iPhone, one Bluetooth headset, rear camera, one mounted orientation, current stable Chrome',
    checks: [
      check(
        'dev-build',
        'Native development build, not Expo Go',
        'device',
        'Install a reproducible Expo prebuild development client on the physical phone. Record the app build identifier and confirm the app was not launched through Expo Go.',
        'The app opens as a native development build and the build identifier is recorded.',
      ),
      check(
        'permissions',
        'Camera and microphone permissions',
        'device',
        'Grant camera and microphone permissions, stop the session, revoke one permission, and start again to verify the app reports the missing permission.',
        'Capture does not become active without both permissions.',
      ),
      check(
        'foreground-only',
        'Foreground-only capture and screen wake',
        'device',
        'Start capture with the rear camera. Keep the app visible and verify the screen stays awake. Put the app in the background or lock the screen once, then return to the app.',
        'Capture is continuous only while the session is active, the app is foregrounded, and the screen is awake; backgrounding pauses/disconnects and foregrounding allows recovery. Do not test or claim locked-screen camera capture.',
      ),
      check(
        'bluetooth-microphone',
        'Bluetooth microphone route',
        'device',
        'Connect the selected Bluetooth headset before starting capture. Verify the phone audio route and make a short spoken test that is audible in the desktop monitor or provider track diagnostics.',
        'The intended Bluetooth microphone route is selected and the remote monitor receives the microphone track.',
      ),
      check(
        'livekit-monitor',
        'LiveKit camera/audio tracks and desktop monitor',
        'provider',
        'From the current stable Chrome desktop, open the prepared session and collect room/participant/track evidence while the phone is active.',
        'One phone participant publishes one camera track and one microphone track; Chrome receives the same session without a second phone recording path.',
      ),
      check(
        'canonical-egress',
        'Canonical LiveKit Egress recording',
        'provider',
        'Stop the capture and wait for the signed Egress completion/persistence evidence. Record the original Egress object ID, checksum, duration, and timestamps.',
        'The server-side LiveKit Egress object is the canonical recording and is available for processing.',
      ),
      check(
        'no-second-upload',
        'No competing mobile canonical upload',
        'provider',
        'Inspect the capture event log and storage objects for the session while Egress is healthy.',
        'No continuously uploaded mobile recording is treated as canonical. A recovery segment may be uploaded only after an explicit server-requested Egress gap.',
      ),
    ],
  },
  12: {
    title: 'Paper-crane/device recovery acceptance prerequisites',
    requiredHardware:
      'the Phase 4 device plus portrait and landscape validation, front/rear camera switching, Bluetooth route recovery, audio interruption recovery, and wired headset when available',
    checks: [
      check(
        'orientation-portrait',
        'Portrait capture',
        'device',
        'Run the capture session in portrait with the rear camera and collect the same track/monitor evidence as Phase 4.',
        'Camera framing remains usable and the session remains active while foregrounded.',
      ),
      check(
        'orientation-landscape',
        'Landscape capture',
        'device',
        'Repeat the session in landscape with the rear camera.',
        'Camera framing and remote monitoring remain usable without claiming background capture.',
      ),
      check(
        'camera-switch',
        'Front/rear camera switching',
        'device',
        'During an active foreground session, switch rear → front → rear and record the observed track state and monitor result.',
        'The selected camera changes and the published video remains recoverable.',
      ),
      check(
        'bluetooth-route-recovery',
        'Bluetooth disconnect and reconnect',
        'device',
        'During capture, disconnect the Bluetooth headset, observe the route/interruption state, reconnect it, and verify the route and microphone recover.',
        'The app records the route change, does not silently claim uninterrupted audio, and resumes after the route is available again.',
      ),
      check(
        'audio-interruption',
        'Phone call or audio interruption recovery',
        'device',
        'Trigger an OS audio interruption or test call while the session is active. End it and observe the app until audio is restored.',
        'Capture pauses or enters recovery, then resumes only after the app is foregrounded and the audio route is available.',
      ),
      check(
        'egress-recovery',
        'Explicit Egress-gap recovery upload',
        'provider',
        'With an intentionally identified Egress gap/corruption interval, verify the server requests recovery before the phone uploads the bounded rolling-buffer segment.',
        'Only requested segments are uploaded; timestamps/checksums reconcile into a derived media version and the original Egress object remains preserved.',
      ),
      check(
        'wired-when-available',
        'Wired headset compatibility (if available)',
        'device',
        'Repeat the microphone route check with a compatible USB-C or Lightning headset. If no compatible hardware is available, record BLOCKED with the reason.',
        'The wired route is observed, or the hardware-dependent check is explicitly BLOCKED.',
      ),
    ],
  },
  15: {
    title: 'Release compatibility matrix',
    requiredHardware:
      'an Android physical device, an iOS physical device, Bluetooth headset on each platform, a compatible wired headset, portrait, and landscape',
    checks: [
      check(
        'android-device',
        'Android physical-device row',
        'device',
        'Run the approved Phase 4 and Phase 12 smoke checks on the supported Android phone and record model, OS, app build, headset, orientation, and results.',
        'The Android row has attached physical evidence for every required column.',
      ),
      check(
        'ios-device',
        'iOS physical-device row',
        'device',
        'Run the approved Phase 4 and Phase 12 smoke checks on the supported iPhone and record model, OS, app build, headset, orientation, and results.',
        'The iOS row has attached physical evidence for every required column.',
      ),
      check(
        'wired-device',
        'Wired headset row',
        'device',
        'Run the wired headset check on each platform where compatible hardware is available.',
        'Each tested wired route has evidence; unavailable hardware is BLOCKED, never PASS.',
      ),
      check(
        'chrome-current',
        'Current stable Chrome monitor',
        'provider',
        'Repeat the desktop monitor check in the current stable Chrome release and record the browser version.',
        'The monitor receives the phone tracks with no simulated media.',
      ),
      check(
        'compatibility-report',
        'Published device/OS compatibility report',
        'operator',
        'Review the completed matrix for device model, OS, app build, audio route, orientation, and known limitations.',
        'The report is complete, dated, and contains no unsupported “any device” claim.',
      ),
    ],
  },
};

function check(id, title, evidenceClass, procedure, expected) {
  return { id, title, evidenceClass, procedure, expected, required: true };
}

export function phaseDefinition(phase) {
  const definition = PHASES[Number(phase)];
  if (!definition) throw new Error(`Unsupported phase: ${phase}. Use 4, 12, or 15.`);
  return definition;
}

export function createReport(phase, now = new Date()) {
  const numericPhase = Number(phase);
  const definition = phaseDefinition(numericPhase);
  const generatedAt = now.toISOString();
  return {
    reportVersion: REPORT_VERSION,
    reportId: `device-acceptance-phase-${numericPhase}-${generatedAt.replace(/[-:.TZ]/g, '')}`,
    gate: `phase-${numericPhase}`,
    title: definition.title,
    generatedAt,
    result: 'NOT_RUN',
    claimsHardwareTested: false,
    operator: null,
    testedAt: null,
    hardware: {
      platform: null,
      deviceModel: null,
      osVersion: null,
      appBuild: null,
      headset: null,
      wiredHeadset: null,
      desktopBrowser: null,
    },
    artifacts: {
      liveKitRoom: null,
      egressObjectId: null,
      egressChecksum: null,
      derivedRecoveryVersionId: null,
    },
    checks: definition.checks.map((item) => ({
      ...item,
      status: 'NOT_RUN',
      observation: null,
      evidence: [],
    })),
    events: [],
    notes: [],
  };
}

export function validateReport(report) {
  const errors = [];
  const warnings = [];
  if (!report || typeof report !== 'object')
    return { errors: ['Report must be a JSON object.'], warnings: [] };

  const phase = Number(String(report.gate ?? '').replace('phase-', ''));
  let definition;
  try {
    definition = phaseDefinition(phase);
  } catch (error) {
    return { errors: [error.message], warnings: [] };
  }

  if (report.reportVersion !== REPORT_VERSION)
    errors.push(`reportVersion must be ${REPORT_VERSION}.`);
  if (!REPORT_STATUSES.includes(report.result))
    errors.push(`result must be one of ${REPORT_STATUSES.join(', ')}.`);
  if (
    report.claimsHardwareTested !== true &&
    report.checks?.some((item) => item?.status === 'PASS')
  ) {
    errors.push(
      'A PASS check requires claimsHardwareTested=true after an actual physical run; the generated template stays NOT_RUN.',
    );
  }
  if (report.claimsHardwareTested === true) {
    for (const field of ['operator', 'testedAt', 'hardware']) {
      if (report[field] == null)
        errors.push(`${field} is required when claimsHardwareTested=true.`);
    }
    for (const field of [
      'platform',
      'deviceModel',
      'osVersion',
      'appBuild',
      'headset',
      'desktopBrowser',
    ]) {
      if (!report.hardware?.[field])
        errors.push(`hardware.${field} is required when claimsHardwareTested=true.`);
    }
  }

  const expectedIds = new Set(definition.checks.map((item) => item.id));
  const actualChecks = Array.isArray(report.checks) ? report.checks : [];
  if (actualChecks.length !== expectedIds.size)
    errors.push(`checks must contain exactly ${expectedIds.size} entries for phase ${phase}.`);
  const seen = new Set();
  for (const item of actualChecks) {
    if (!item || typeof item !== 'object') {
      errors.push('Each check must be an object.');
      continue;
    }
    if (!expectedIds.has(item.id)) errors.push(`Unknown check id: ${String(item.id)}.`);
    if (seen.has(item.id)) errors.push(`Duplicate check id: ${String(item.id)}.`);
    seen.add(item.id);
    if (!REPORT_STATUSES.includes(item.status))
      errors.push(`Check ${String(item.id)} has an invalid status.`);
    if (!Array.isArray(item.evidence))
      errors.push(`Check ${String(item.id)} evidence must be an array.`);
    if (item.status === 'PASS') {
      if (!Array.isArray(item.evidence) || item.evidence.length === 0)
        errors.push(`PASS check ${String(item.id)} requires evidence.`);
      for (const evidence of item.evidence ?? []) {
        if (!evidence || !EVIDENCE_SOURCES.includes(evidence.source)) {
          errors.push(
            `PASS check ${String(item.id)} requires evidence source physical, provider, or operator.`,
          );
        }
        if (!evidence?.reference || !evidence?.kind)
          errors.push(`Evidence for PASS check ${String(item.id)} requires kind and reference.`);
        if (containsSecretLikeText(evidence))
          errors.push(
            `Evidence for ${String(item.id)} appears to contain a token or secret; redact it.`,
          );
      }
    }
  }

  if (report.result === 'PASS') {
    const required = actualChecks.filter((item) => item?.required !== false);
    if (required.some((item) => item.status !== 'PASS'))
      errors.push('result=PASS requires every required check to be PASS.');
    if (!report.artifacts?.liveKitRoom || !report.artifacts?.egressObjectId)
      errors.push('result=PASS requires the LiveKit room and canonical Egress object references.');
  }
  if (report.claimsHardwareTested !== true && report.result === 'PASS')
    errors.push('result=PASS is not allowed while claimsHardwareTested=false.');
  if (report.result === 'NOT_RUN' && report.claimsHardwareTested === true)
    warnings.push(
      'claimsHardwareTested=true but result is NOT_RUN; complete or correct the report before sharing it.',
    );
  if (
    (report.result === 'BLOCKED' && !Array.isArray(report.notes)) ||
    (report.result === 'BLOCKED' && report.notes.length === 0)
  )
    warnings.push('A BLOCKED report should include a concrete blocker in notes.');
  return { errors, warnings };
}

function containsSecretLikeText(value) {
  const text = JSON.stringify(value);
  return /bearer\s+|authorization\s*[:=]|client_secret|access_token|refresh_token|api[_-]?key|token\s*[:=]/i.test(
    text,
  );
}

export function reportSummary(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  return {
    gate: report?.gate ?? 'unknown',
    result: report?.result ?? 'invalid',
    checks: {
      total: checks.length,
      pass: checks.filter((item) => item.status === 'PASS').length,
      fail: checks.filter((item) => item.status === 'FAIL').length,
      blocked: checks.filter((item) => item.status === 'BLOCKED').length,
      notRun: checks.filter((item) => item.status === 'NOT_RUN').length,
    },
  };
}

const PHYSICAL_ENVIRONMENT_KEYS = [
  'EXPO_PUBLIC_LIVEKIT_URL',
  'EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT',
  'EXPO_PUBLIC_CAPTURE_PAIRING_ENDPOINT',
  'EXPO_PUBLIC_COMPANY_ID',
  'EXPO_PUBLIC_MEMBER_ID',
  'EXPO_PUBLIC_DEVICE_ID',
];

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isLocalHost(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function validatePhysicalEnvironment(
  environment = process.env,
  { allowLocalhost = false } = {},
) {
  const errors = [];
  const missing = PHYSICAL_ENVIRONMENT_KEYS.filter((key) => !environment[key]);
  if (missing.length > 0)
    errors.push(`Missing required physical-device variables: ${missing.join(', ')}.`);

  const livekitUrl = environment.EXPO_PUBLIC_LIVEKIT_URL;
  if (livekitUrl) {
    try {
      const parsed = new URL(livekitUrl);
      if (!['ws:', 'wss:'].includes(parsed.protocol))
        errors.push('EXPO_PUBLIC_LIVEKIT_URL must use ws:// or wss://.');
      if (!allowLocalhost && isLocalHost(livekitUrl))
        errors.push('EXPO_PUBLIC_LIVEKIT_URL cannot point to localhost for a physical device.');
    } catch {
      errors.push('EXPO_PUBLIC_LIVEKIT_URL must be a valid WebSocket URL.');
    }
  }

  for (const key of [
    'EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT',
    'EXPO_PUBLIC_CAPTURE_PAIRING_ENDPOINT',
  ]) {
    const value = environment[key];
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol))
        errors.push(`${key} must use http:// or https://.`);
      if (!allowLocalhost && isLocalHost(value))
        errors.push(`${key} cannot point to localhost for a physical device.`);
    } catch {
      errors.push(`${key} must be a valid HTTP URL.`);
    }
  }

  for (const key of ['EXPO_PUBLIC_COMPANY_ID', 'EXPO_PUBLIC_MEMBER_ID', 'EXPO_PUBLIC_DEVICE_ID']) {
    if (environment[key] && !isUuid(environment[key])) errors.push(`${key} must be a UUID.`);
  }
  if (
    environment.EXPO_PUBLIC_CAPTURE_PAIRING_CODE &&
    !/^\d{6}$/.test(environment.EXPO_PUBLIC_CAPTURE_PAIRING_CODE)
  ) {
    errors.push('EXPO_PUBLIC_CAPTURE_PAIRING_CODE must be six digits when provided.');
  }
  return { errors, valuesChecked: PHYSICAL_ENVIRONMENT_KEYS.length };
}
function usage() {
  console.log(`Usage:
  node scripts/device-acceptance.mjs init --phase 4|12|15 --out <report.json>
  node scripts/device-acceptance.mjs validate --report <report.json> [--strict]
  node scripts/device-acceptance.mjs checklist --phase 4|12|15
  node scripts/device-acceptance.mjs preflight [--allow-localhost]

init creates a NOT_RUN report. It never records hardware success.
validate checks report structure, evidence, and anti-simulation invariants.
--strict exits non-zero until the selected gate is fully evidenced as PASS.`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args) {
  const command = args[0];
  if (!command || command === '--help' || command === '-h') {
    usage();
    return 0;
  }
  if (command === 'init') {
    const phase = option(args, '--phase');
    const output = option(args, '--out');
    if (!phase || !output) throw new Error('init requires --phase and --out.');
    const report = createReport(phase);
    await writeFile(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Created ${report.gate} report with result NOT_RUN: ${path.resolve(output)}`);
    return 0;
  }
  if (command === 'checklist') {
    const definition = phaseDefinition(option(args, '--phase'));
    console.log(`${definition.title}\n`);
    for (const item of definition.checks)
      console.log(
        `[ ] ${item.id}: ${item.title}\n    Procedure: ${item.procedure}\n    Expected: ${item.expected}\n`,
      );
    return 0;
  }
  if (command === 'preflight') {
    const validation = validatePhysicalEnvironment(process.env, {
      allowLocalhost: args.includes('--allow-localhost'),
    });
    console.log(
      JSON.stringify(
        {
          ...validation,
          mode: args.includes('--allow-localhost') ? 'local-debug' : 'physical-device',
        },
        null,
        2,
      ),
    );
    return validation.errors.length > 0 ? 1 : 0;
  }
  if (command === 'validate') {
    const reportPath = option(args, '--report');
    if (!reportPath) throw new Error('validate requires --report.');
    const report = JSON.parse(await readFile(path.resolve(reportPath), 'utf8'));
    const validation = validateReport(report);
    console.log(JSON.stringify({ ...reportSummary(report), ...validation }, null, 2));
    if (validation.errors.length > 0) return 1;
    if (args.includes('--strict') && report.result !== 'PASS') return 2;
    return 0;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2))
    .then((code) => (process.exitCode = code))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
