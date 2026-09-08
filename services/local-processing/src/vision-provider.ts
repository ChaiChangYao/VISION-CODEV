export type ModelObservationResult = {
  procedureVisible: boolean;
  screenDominates: boolean;
  physicalActionFrameCount: number;
  summary: string;
  steps: Array<{ title: string; observedAction: string; endState: string; confidence: number }>;
};

export type VisionProviderConfig = {
  provider: 'ollama' | 'openai';
  model: string;
  ollamaUrl: string;
  openaiApiKey?: string;
  openaiBaseUrl: string;
};

export const visionPrompt = `Analyze these chronological camera frames using only visible pixels. A screen or keyboard is not a manipulated work object. procedureVisible is true only if hands manipulate the same non-screen object in at least two frames and an ordered change is visible; otherwise steps is empty. Return at most 4 steps. Never infer actions from screen text.`;

export function visionProviderConfig(env: NodeJS.ProcessEnv = process.env): VisionProviderConfig {
  const provider = (env.VISION_CODEF_VLM_PROVIDER ?? 'ollama').trim().toLowerCase();
  if (provider !== 'ollama' && provider !== 'openai') throw new Error(`Unsupported VISION_CODEF_VLM_PROVIDER: ${provider}`);
  return {
    provider,
    model: provider === 'openai' ? env.OPENAI_VISION_MODEL ?? 'gpt-5-mini' : env.VISION_CODEF_MODEL_ID ?? 'qwen3-vl:2b',
    ollamaUrl: (env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, ''),
    openaiApiKey: env.OPENAI_API_KEY?.trim(),
    openaiBaseUrl: (env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
  };
}

function parseJson(value: string): ModelObservationResult {
  return JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as ModelObservationResult;
}

export async function analyzeWithVisionProvider(images: string[], config: VisionProviderConfig, fetcher: typeof fetch = fetch): Promise<ModelObservationResult> {
  if (config.provider === 'ollama') {
    const response = await fetcher(`${config.ollamaUrl}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5 * 60_000),
      body: JSON.stringify({ model: config.model, stream: false, think: false, format: 'json', options: { temperature: 0, num_ctx: 6144, num_predict: 300 }, messages: [{ role: 'user', content: `/no_think ${visionPrompt}`, images }] }),
    });
    if (!response.ok) throw new Error(`Ollama analysis failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { message?: { content?: string; thinking?: string } };
    return parseJson(payload.message?.content?.trim() || payload.message?.thinking?.trim() || '{}');
  }

  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is required when VISION_CODEF_VLM_PROVIDER=openai.');
  const response = await fetcher(`${config.openaiBaseUrl}/responses`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiApiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(2 * 60_000),
    body: JSON.stringify({
      model: config.model,
      store: false,
      input: [{ role: 'user', content: [{ type: 'input_text', text: visionPrompt }, ...images.map((value) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${value}`, detail: 'low' }))] }],
      text: { format: { type: 'json_schema', name: 'golden_run_observation', strict: true, schema: {
        type: 'object', additionalProperties: false,
        required: ['procedureVisible', 'screenDominates', 'physicalActionFrameCount', 'summary', 'steps'],
        properties: {
          procedureVisible: { type: 'boolean' }, screenDominates: { type: 'boolean' }, physicalActionFrameCount: { type: 'integer' }, summary: { type: 'string' },
          steps: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['title', 'observedAction', 'endState', 'confidence'], properties: { title: { type: 'string' }, observedAction: { type: 'string' }, endState: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 } } } },
        },
      } } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI vision analysis failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as { status?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const output = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (!output) throw new Error(`OpenAI vision response did not contain output_text (status: ${payload.status ?? 'unknown'}).`);
  return parseJson(output);
}
