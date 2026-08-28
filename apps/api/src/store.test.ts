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
    store.deployments.set('deployment', { id: 'deployment', companyId: 'company', workflowId: 'restored', status: 'active', currentStep: 1, deviations: [], paperState: { status: 'interrupted', observedSinceMs: 1000 }, intervention: { recoveryStepId: 'step-1' } });
    await store.flush();
    await store.close();
    expect(persistence.save).toHaveBeenCalledOnce();
    const flushedStore = vi.mocked(persistence.save).mock.calls[0]?.[0];
    expect(flushedStore?.deployments.get('deployment')?.intervention).toEqual({ recoveryStepId: 'step-1' });
    expect(flushedStore?.deployments.get('deployment')?.paperState).toEqual({ status: 'interrupted', observedSinceMs: 1000 });
    expect(persistence.close).toHaveBeenCalledOnce();
  });
});
