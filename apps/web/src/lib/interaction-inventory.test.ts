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
        'train-start-session',
        'train-stop-session',
        'connected-publish',
        'connected-deploy-start',
        'connected-deploy-recover',
        'connected-deploy-why',
      ]),
    );
  });
  it('registers rendered Golden Run controls and keeps demo fixtures explicit', () => {
    const entries = new Map(interactionInventory.map((entry) => [entry.id, entry]));
    for (const id of [
      'train-create-session',
      'train-start-session',
      'train-stop-session',
      'connected-publish',
      'connected-deploy-start',
      'connected-deploy-recover',
      'connected-wrong-fold-fixture',
      'connected-deploy-why',
      'intent-golden-run',
      'intent-needs-clarification',
    ])
      expect(entries.has(id)).toBe(true);
    expect(entries.get('connected-wrong-fold-fixture')?.notes).toContain(
      'never physical acceptance evidence',
    );
    expect(entries.get('connected-deploy-why')?.kind).toBe('region');
  });
});
