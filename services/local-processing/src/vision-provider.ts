export type EvidenceWindowInput = {
  index: number;
  startMs: number;
  keyframeMs: number;
  endMs: number;
  changeScore: number;
  transcript: string;
  frames: Array<{ timestampMs: number; imageBase64: string }>;
};

export type ModelObservationResult = {
  procedureVisible: boolean;
  screenDominates: boolean;
  physicalActionFrameCount: number;
  summary: string;
  steps: Array<{ eventIndex: number; title: string; observedAction: string; endState: string; confidence: number }>;
};

export type VisionProviderConfig = {
  provider: 'ollama' | 'openai';
  model: string;
  ollamaUrl: string;
  openaiApiKey?: string;
  openaiBaseUrl: string;
};

export const visionPrompt = `Analyze bounded change events from an expert procedure recording. Each event contains chronological camera frames and the time-aligned spoken transcript. Use visible pixels as the primary evidence and speech only as supporting context. Exact object, rack, or slot identifiers may be used only when visibly legible or explicitly spoken. Return at most one concise procedure step per eventIndex, omit camera motion and irrelevant events, and preserve chronological order. A screen or keyboard is not a manipulated work object. Never invent an action or final state.`;

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

function windowLabel(window: EvidenceWindowInput): string {
  return `Event ${window.index}: window ${window.startMs}-${window.endMs} ms; keyframe ${window.keyframeMs} ms; change score ${window.changeScore.toFixed(3)}; matching speech: ${window.transcript || '[none]'}`;
}

function openAiContent(windows: EvidenceWindowInput[]) {
  return [
    { type: 'input_text', text: visionPrompt },
    ...windows.flatMap((window) => [
      { type: 'input_text', text: windowLabel(window) },
      ...window.frames.map((frame) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${frame.imageBase64}`, detail: 'low' })),
    ]),
  ];
}

export async function analyzeWithVisionProvider(
  windows: EvidenceWindowInput[],
  config: VisionProviderConfig,
  fetcher: typeof fetch = fetch,
): Promise<ModelObservationResult> {
  if (windows.length === 0) throw new Error('At least one evidence window is required.');
  if (config.provider === 'ollama') {
    const response = await fetcher(`${config.ollamaUrl}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5 * 60_000),
      body: JSON.stringify({
        model: config.model, stream: false, think: false, format: 'json',
        options: { temperature: 0, num_ctx: 12288, num_predict: 900 },
        messages: [{ role: 'user', content: `/no_think ${visionPrompt}\n\n${windows.map(windowLabel).join('\n')}`, images: windows.flatMap((window) => window.frames.map((frame) => frame.imageBase64)) }],
      }),
    });
    if (!response.ok) throw new Error(`Ollama analysis failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const payload = await response.json() as { message?: { content?: string; thinking?: string } };
    return parseJson(payload.message?.content?.trim() || payload.message?.thinking?.trim() || '{}');
  }

  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is required when VISION_CODEF_VLM_PROVIDER=openai.');
  const eventIndexes = windows.map((window) => window.index);
  const response = await fetcher(`${config.openaiBaseUrl}/responses`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openaiApiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(3 * 60_000),
    body: JSON.stringify({
      model: config.model,
      store: false,
      input: [{ role: 'user', content: openAiContent(windows) }],
      text: { format: { type: 'json_schema', name: 'golden_run_event_observation', strict: true, schema: {
        type: 'object', additionalProperties: false,
        required: ['procedureVisible', 'screenDominates', 'physicalActionFrameCount', 'summary', 'steps'],
        properties: {
          procedureVisible: { type: 'boolean' }, screenDominates: { type: 'boolean' }, physicalActionFrameCount: { type: 'integer' }, summary: { type: 'string' },
          steps: { type: 'array', maxItems: windows.length, items: { type: 'object', additionalProperties: false, required: ['eventIndex', 'title', 'observedAction', 'endState', 'confidence'], properties: {
            eventIndex: { type: 'integer', minimum: Math.min(...eventIndexes), maximum: Math.max(...eventIndexes) },
            title: { type: 'string' }, observedAction: { type: 'string' }, endState: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 },
          } } },
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
