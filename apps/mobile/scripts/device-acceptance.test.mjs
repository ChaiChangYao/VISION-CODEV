import { describe, expect, it } from 'vitest';

import {
  createReport,
  phaseDefinition,
  reportSummary,
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
      item.evidence = [{ kind: 'manual-observation', source: 'physical', reference: `${item.id}.json` }];
      item.observation = 'Observed and recorded by the operator.';
    }
    expect(validateReport(report)).toEqual({ errors: [], warnings: [] });
    expect(reportSummary(report)).toMatchObject({ result: 'PASS', checks: { pass: 7, notRun: 0 } });
  });

  it('requires a concrete blocker when a report is marked BLOCKED', () => {
    const report = createReport(15);
    report.result = 'BLOCKED';
    expect(validateReport(report).warnings).toContain('A BLOCKED report should include a concrete blocker in notes.');
    report.notes = ['iOS physical device was unavailable for this run.'];
    expect(validateReport(report).warnings).toEqual([]);
  });
});
