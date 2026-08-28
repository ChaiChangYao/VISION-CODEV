import { describe, expect, it } from 'vitest';

import {
  createReport,
  phaseDefinition,
  reportSummary,
  validatePhysicalEnvironment,
  validateReport,
} from './device-acceptance.mjs';

describe('physical device acceptance report harness', () => {
  it('creates an explicit NOT_RUN report for every staged gate', () => {
    for (const phase of [4, 12, 15]) {
      const report = createReport(phase, new Date('2026-08-28T00:00:00.000Z'));
      expect(report.result).toBe('NOT_RUN');
      expect(report.claimsHardwareTested).toBe(false);
      expect(report.checks).toHaveLength(phaseDefinition(phase).checks.length);
      expect(report.checks.every((item) => item.status === 'NOT_RUN')).toBe(true);
      expect(validateReport(report).errors).toEqual([]);
    }
  });

  it('does not allow a hardware pass without physical evidence', () => {
    const report = createReport(4);
    report.checks[0].status = 'PASS';
    report.checks[0].evidence = [{ kind: 'log', source: 'fixture', reference: 'fixture.log' }];
    const validation = validateReport(report);
    expect(validation.errors.some((error) => error.includes('evidence source'))).toBe(true);
  });

  it('accepts a fully evidenced report only after explicit operator attestation', () => {
    const report = createReport(4);
    report.result = 'PASS';
    report.claimsHardwareTested = true;
    report.operator = 'operator-1';
    report.testedAt = '2026-08-28T01:00:00.000Z';
    report.hardware = {
      platform: 'android',
      deviceModel: 'supported-device',
      osVersion: 'Android 15',
      appBuild: 'dev-build-1',
      headset: 'bluetooth-headset',
      wiredHeadset: 'not-tested',
      desktopBrowser: 'Chrome 140',
    };
    report.artifacts.liveKitRoom = 'company-room';
    report.artifacts.egressObjectId = 'egress/object.mp4';
    for (const item of report.checks) {
      item.status = 'PASS';
      item.evidence = [
        { kind: 'manual-observation', source: 'physical', reference: `${item.id}.json` },
      ];
      item.observation = 'Observed and recorded by the operator.';
    }
    expect(validateReport(report)).toEqual({ errors: [], warnings: [] });
    expect(reportSummary(report)).toMatchObject({ result: 'PASS', checks: { pass: 7, notRun: 0 } });
  });

  it('rejects localhost and incomplete physical-device configuration', () => {
    const validation = validatePhysicalEnvironment({
      EXPO_PUBLIC_LIVEKIT_URL: 'ws://localhost:7880',
      EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT: 'http://127.0.0.1:4000/api/capture/token',
      EXPO_PUBLIC_CAPTURE_PAIRING_ENDPOINT: 'http://localhost:4000/api/capture/pair',
      EXPO_PUBLIC_COMPANY_ID: 'company',
      EXPO_PUBLIC_MEMBER_ID: 'member',
      EXPO_PUBLIC_DEVICE_ID: 'device',
    });
    expect(validation.errors).toHaveLength(6);
    expect(validation.errors.join(' ')).toContain('localhost');
  });

  it('accepts a complete non-local physical-device configuration', () => {
    const validation = validatePhysicalEnvironment({
      EXPO_PUBLIC_LIVEKIT_URL: 'wss://livekit.example.test',
      EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT: 'https://api.example.test/api/capture/token',
      EXPO_PUBLIC_CAPTURE_PAIRING_ENDPOINT: 'https://api.example.test/api/capture/pair',
      EXPO_PUBLIC_COMPANY_ID: '11111111-1111-4111-8111-111111111111',
      EXPO_PUBLIC_MEMBER_ID: '22222222-2222-4222-8222-222222222222',
      EXPO_PUBLIC_DEVICE_ID: '33333333-3333-4333-8333-333333333333',
      EXPO_PUBLIC_CAPTURE_PAIRING_CODE: '123456',
    });
    expect(validation).toEqual({ errors: [], valuesChecked: 6 });
  });
  it('requires a concrete blocker when a report is marked BLOCKED', () => {
    const report = createReport(15);
    report.result = 'BLOCKED';
    expect(validateReport(report).warnings).toContain(
      'A BLOCKED report should include a concrete blocker in notes.',
    );
    report.notes = ['iOS physical device was unavailable for this run.'];
    expect(validateReport(report).warnings).toEqual([]);
  });
});
