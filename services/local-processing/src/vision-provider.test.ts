import { describe, expect, it, vi } from 'vitest';
import { analyzeWithVisionProvider, visionProviderConfig } from './vision-provider.js';

describe('vision provider selection', () => {
  it('defaults to the local Ollama provider without an API key', () => {
    expect(visionProviderConfig({} as NodeJS.ProcessEnv)).toMatchObject({ provider: 'ollama', model: 'qwen3-vl:2b' });
  });

  it('sends bounded image inputs to the OpenAI Responses API and parses structured output', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.text.format.type).toBe('json_schema');
      expect(body.input[0].content[1]).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,frame', detail: 'low' });
      return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ procedureVisible: true, screenDominates: false, physicalActionFrameCount: 2, summary: 'folding', steps: [] }) }] }] }), { status: 200 });
    });
    const result = await analyzeWithVisionProvider(['frame'], { provider: 'openai', model: 'gpt-5-mini', openaiApiKey: 'test-key', openaiBaseUrl: 'https://api.openai.test/v1', ollamaUrl: '' }, fetcher as typeof fetch);
    expect(result.summary).toBe('folding');
    expect(fetcher).toHaveBeenCalledWith('https://api.openai.test/v1/responses', expect.objectContaining({ method: 'POST' }));
  });
});
