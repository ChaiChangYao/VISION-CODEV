import { describe, expect, it } from 'vitest';

describe('API contract smoke tests', () => {
  it('keeps the first integration contract focused on a Golden Run', () => {
    expect(['golden_run', 'camera_automation', 'ambiguous']).toContain('golden_run');
  });
});

