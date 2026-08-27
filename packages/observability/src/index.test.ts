import { describe, expect, it } from 'vitest';
import { createLogger, createTraceId, withObservabilityContext, type LogRecord } from './index.js';

describe('observability primitives', () => {
  it('emits structured records with request context', () => {
    const records: LogRecord[] = [];
    const logger = createLogger('test', (record) => records.push(record));
    withObservabilityContext(
      { traceId: createTraceId(), companyId: 'company-a', memberId: 'member-a' },
      () => {
        logger.info('captured', { state: 'active' });
      },
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 'info',
      message: 'captured',
      service: 'test',
      companyId: 'company-a',
      memberId: 'member-a',
      fields: { state: 'active' },
    });
  });
});
