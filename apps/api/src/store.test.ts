import { describe, expect, it, vi } from 'vitest';
import { DevelopmentStore } from './store.js';
import type { RuntimePersistence } from './runtime-persistence.js';

describe('DevelopmentStore persistence lifecycle', () => {
  it('hydrates before serving and flushes the complete store snapshot', async () => {
    const persistence: RuntimePersistence = {
      load: vi.fn(async (store) => {
        store.workflows.set('restored', {
          id: 'restored', companyId: 'company', title: 'Restored', family: 'golden_run', objective: 'Restored', status: 'Draft', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        });
      }),
      save: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const store = new DevelopmentStore(persistence);
    await store.ready;
    expect(store.workflows.has('restored')).toBe(true);
    await store.flush();
    await store.close();
    expect(persistence.save).toHaveBeenCalledOnce();
    expect(persistence.close).toHaveBeenCalledOnce();
  });
});
