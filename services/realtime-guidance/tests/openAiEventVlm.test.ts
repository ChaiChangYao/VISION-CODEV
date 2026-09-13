import { describe, expect, it, vi } from 'vitest';
import { OpenAiEventVlmProvider, type ChangeEventEvidence } from '../src/eventVlm.js';

const step = {
  id: '11111111-1111-4111-8111-111111111111', ordinal: 1, totalSteps: 2, title: 'Place part',
  instruction: 'Place the part in the slot.', observedAction: 'Part enters slot.', startState: [], expectedAction: ['place'],
  endState: ['seated'], allowableVariations: [], deviationRules: ['Wrong slot'], completionCheck: 'Part is seated.', seniorReasoning: '',
};
const event: ChangeEventEvidence = {
  trigger: { detectorId: 'test', detectorVersion: '1', timestampMs: 1234, score: 1, changed: true, latencyMs: 1 },
  windowStartMs: 0, windowEndMs: 2000,
  frames: [{ data: new Uint8Array([255, 0, 0, 255]), width: 1, height: 1, pixelFormat: 'rgba', timestampMs: 1000, participantIdentity: 'phone' }],
};

describe('OpenAiEventVlmProvider', () => {
  it('sends bounded PNG evidence with strict structured output and pins server-owned identity fields', async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.text.format.type).toBe('json_schema');
      expect(body.input[0].content[1].image_url).toMatch(/^data:image\/png;base64,/);
      return new Response(JSON.stringify({ output_text: JSON.stringify({ timestampMs: 999, stepId: crypto.randomUUID(), assessment: 'completed', confidence: 0.93, observedAction: 'Part seated.', evidence: 'Slot and part visible.', deviationDetail: null }) }), { status: 200 });
    });
    const provider = new OpenAiEventVlmProvider('secret', 'gpt-test', request as typeof fetch);
    await expect(provider.observeEvent(event, { companyId: 'c', workflowId: 'w', deploymentId: 'd', currentStep: step })).resolves.toMatchObject({ timestampMs: 1234, stepId: step.id, assessment: 'completed' });
    expect(request).toHaveBeenCalledOnce();
  });
});
