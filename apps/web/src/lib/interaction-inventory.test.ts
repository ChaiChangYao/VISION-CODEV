import { describe, expect, it } from 'vitest';
import { interactionInventory } from './interaction-inventory';

describe('web interaction inventory', () => {
  it('has unique control identifiers', () => {
    const ids = interactionInventory.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every owned lifecycle action', () => {
    expect(interactionInventory.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'composer-submit',
        'train-start',
        'train-stop',
        'approve-publish',
        'deploy-start',
        'deploy-recovery',
        'deploy-why',
      ]),
    );
  });
});
