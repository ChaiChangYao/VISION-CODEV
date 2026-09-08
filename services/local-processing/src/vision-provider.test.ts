import { describe, expect, it, vi } from 'vitest';
import { analyzeWithVisionProvider, visionProviderConfig } from './vision-provider.js';

describe('vision provider selection', () => {
  it('defaults to the local Ollama provider without an API key', () => {
    expect(visionProviderConfig({} as NodeJS.ProcessEnv)).toMatchObject({ provider: 'ollama', model: 'qwen3-vl:2b' });
  });

  it('sends timestamped frames and aligned speech to the OpenAI Responses API', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.text.format.type).toBe('json_schema');
      expect(body.input[0].content[1].text).toContain('keyframe 1500 ms');
      expect(body.input[0].content[1].text).toContain('move rack A');
      expect(body.input[0].content[2]).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,frame', detail: 'low' });
      return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ procedureVisible: true, screenDominates: false, physicalActionFrameCount: 2, summary: 'rack move', steps: [{ eventIndex: 0, title: 'Move rack A', observedAction: 'Move rack A to slot 5B', endState: 'Rack A is in slot 5B', confidence: 0.9 }] }) }] }] }), { status: 200 });
    });
    const result = await analyzeWithVisionProvider([{ index: 0, startMs: 0, keyframeMs: 1500, endMs: 3000, changeScore: 0.5, transcript: 'move rack A', frames: [{ timestampMs: 1500, imageBase64: 'frame' }] }], { provider: 'openai', model: 'gpt-5-mini', openaiApiKey: 'test-key', openaiBaseUrl: 'https://api.openai.test/v1', ollamaUrl: '' }, fetcher as typeof fetch);
    expect(result.steps[0]?.eventIndex).toBe(0);
    expect(fetcher).toHaveBeenCalledWith('https://api.openai.test/v1/responses', expect.objectContaining({ method: 'POST' }));
  });
});
