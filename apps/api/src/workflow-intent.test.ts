import { describe, expect, it } from 'vitest';

import { classifyWorkflowIntent, resolveWorkflowIntent } from './workflow-intent.js';

describe('workflow intent routing', () => {
  it('recognizes the default paper-crane brief as a Golden Run', () => {
    const intent = classifyWorkflowIntent(
      'Capture the expert way to fold a paper crane, then guide another person through the approved sequence.',
    );

    expect(intent.family).toBe('golden_run');
    expect(intent.missingCriticalFields).toEqual([]);
  });

  it('honors an explicit workflow-family choice', () => {
    const intent = resolveWorkflowIntent('Watch this process.', 'golden_run');

    expect(intent).toMatchObject({
      family: 'golden_run',
      confidence: 1,
      missingCriticalFields: [],
    });
  });
});
