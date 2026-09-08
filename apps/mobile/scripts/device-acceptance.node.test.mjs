import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createReport, phaseDefinition, reportSummary, validatePhysicalEnvironment, validateReport } from './device-acceptance.mjs';

describe('physical device acceptance report harness', () => {
  it('creates an explicit NOT_RUN report for every staged gate', () => {
    for (const phase of [4, 12, 15]) {
      const report = createReport(phase, new Date('2026-08-28T00:00:00.000Z'));
      assert.equal(report.result, 'NOT_RUN');
      assert.equal(report.claimsHardwareTested, false);
      assert.equal(report.checks.length, phaseDefinition(phase).checks.length);
      assert.equal(report.checks.every((item) => item.status === 'NOT_RUN'), true);
      assert.deepEqual(validateReport(report).errors, []);
    }
  });

  it('does not allow a hardware pass without physical evidence', () => {
    const report = createReport(4);
    report.checks[0].status = 'PASS';
    report.checks[0].evidence = [{ kind: 'log', source: 'fixture', reference: 'fixture.log' }];
    assert.equal(validateReport(report).errors.some((error) => error.includes('evidence source')), true);
  });

  it('accepts a fully evidenced report only after explicit operator attestation', () => {
    const report = createReport(4);
    report.result = 'PASS'; report.claimsHardwareTested = true; report.operator = 'operator-1'; report.testedAt = '2026-08-28T01:00:00.000Z';
    report.hardware = { platform: 'android', deviceModel: 'supported-device', osVersion: 'Android 15', appBuild: 'dev-build-1', headset: 'bluetooth-headset', wiredHeadset: 'not-tested', desktopBrowser: 'Chrome 140' };
    report.artifacts.liveKitRoom = 'company-room'; report.artifacts.egressObjectId = 'egress/object.mp4';
    for (const item of report.checks) { item.status = 'PASS'; item.evidence = [{ kind: 'manual-observation', source: 'physical', reference: `${item.id}.json` }]; item.observation = 'Observed and recorded by the operator.'; }
    assert.deepEqual(validateReport(report), { errors: [], warnings: [] });
    assert.deepEqual(reportSummary(report), { gate: 'phase-4', result: 'PASS', checks: { total: 7, pass: 7, fail: 0, blocked: 0, notRun: 0 } });
  });

  it('rejects localhost and incomplete physical-device configuration', () => {
    const validation = validatePhysicalEnvironment({ EXPO_PUBLIC_LIVEKIT_URL: 'ws://localhost:7880', EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT: 'http://127.0.0.1:4000/api/capture/token', EXPO_PUBLIC_CAPTURE_PAIRING_ENDPOINT: 'http://localhost:4000/api/capture/pair', EXPO_PUBLIC_COMPANY_ID: 'company', EXPO_PUBLIC_MEMBER_ID: 'member', EXPO_PUBLIC_DEVICE_ID: 'device' });
    assert.equal(validation.errors.length, 6);
    assert.match(validation.errors.join(' '), /localhost/);
  });

  it('accepts a complete non-local physical-device configuration', () => {
    const validation = validatePhysicalEnvironment({ EXPO_PUBLIC_LIVEKIT_URL: 'wss://livekit.example.test', EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT: 'https://api.example.test/api/capture/token', EXPO_PUBLIC_CAPTURE_PAIRING_ENDPOINT: 'https://api.example.test/api/capture/pair', EXPO_PUBLIC_COMPANY_ID: '11111111-1111-4111-8111-111111111111', EXPO_PUBLIC_MEMBER_ID: '22222222-2222-4222-8222-222222222222', EXPO_PUBLIC_DEVICE_ID: '33333333-3333-4333-8333-333333333333', EXPO_PUBLIC_CAPTURE_PAIRING_CODE: '123456' });
    assert.deepEqual(validation, { errors: [], valuesChecked: 6 });
  });

  it('requires a concrete blocker when a report is marked BLOCKED', () => {
    const report = createReport(15); report.result = 'BLOCKED';
    assert.equal(validateReport(report).warnings.includes('A BLOCKED report should include a concrete blocker in notes.'), true);
    report.notes = ['iOS physical device was unavailable for this run.'];
    assert.deepEqual(validateReport(report).warnings, []);
  });
});
