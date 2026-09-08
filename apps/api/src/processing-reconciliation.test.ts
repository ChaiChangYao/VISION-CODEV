import { describe, expect, it } from 'vitest';
import { processingReconciliationMessage } from './processing-reconciliation.js';

describe('processing execution reconciliation', () => {
  it('leaves active executions untouched', () => {
    expect(processingReconciliationMessage('RUNNING')).toBeUndefined();
    expect(processingReconciliationMessage('CONTINUED_AS_NEW')).toBeUndefined();
  });

  it('turns every terminal mismatch into an actionable retry state', () => {
    expect(processingReconciliationMessage('FAILED')).toContain('FAILED');
    expect(processingReconciliationMessage('TIMED_OUT')).toContain('TIMED_OUT');
    expect(processingReconciliationMessage('COMPLETED')).toContain('completion callback');
  });
});
