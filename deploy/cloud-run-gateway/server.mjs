import { createServer } from 'node:http';

const port = Number(process.env.PORT || 8080);
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
const maxBodyBytes = 2_500_000;
const rateWindows = new Map();

const procedures = {
  printer: {
    title: 'Learn how to use a 3D printer',
    steps: [
      'Check that the print bed is clear and clean.',
      'Load the correct filament and confirm it feeds freely.',
      'Select the approved print file and verify material settings.',
      'Start the print and watch the first layer for adhesion.',
    ],
  },
};
const procedureStore = new Map(Object.entries(procedures));

function json(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function originAllowed(request) {
  const origin = request.headers.origin;
  return !origin || origin === allowedOrigin;
}

function withinRateLimit(request) {
  const key = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) { rateWindows.set(key, { startedAt: now, count: 1 }); return true; }
  current.count += 1;
  return current.count <= 12;
}

async function body(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error('Frame payload is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function outputText(result) {
  if (typeof result.output_text === 'string') return result.output_text;
  for (const item of result.output || []) for (const part of item.content || []) if (part.type === 'output_text') return part.text;
  throw new Error('The vision model returned no structured result.');
}

async function analyze(input) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Vision analysis is not configured.');
  if (typeof input.imageDataUrl !== 'string' || !input.imageDataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('A JPEG camera frame is required.');
  const expectedStep = String(input.expectedStep || '').slice(0, 500);
  const cleanInspection = /clear|clean|interior|print bed|bed is empty/i.test(expectedStep);
  const criteria = cleanInspection
    ? 'This is a visual cleanliness/clearance inspection. Mark aligned only if the printer interior and print bed are sufficiently visible and clearly empty, unobstructed, and free of loose filament, scraps, residue, or other debris. A hand, tool, object, shadow, glare, or cropped/blurred view is not proof of cleanliness. If any required area is hidden or cleanliness cannot be verified, mark uncertain. Mark mistake only when visible debris, residue, or an obstruction is present.'
    : 'Judge whether the visible state satisfies the approved step. Mark aligned only when the required result is visibly demonstrated; do not infer completion from a hand gesture or intention. If the relevant area is hidden or ambiguous, mark uncertain.';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 180,
      instructions: `You are a strict visual quality inspector for a first-person technician camera. Assess the visible state against one approved procedure step, not merely the motion being performed. ${criteria} Describe only visible evidence. Never invent completion. Guidance must be one brief spoken sentence that tells the technician what to show, check, or correct.`,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: `Approved current step: ${expectedStep}\nInspection rule: ${criteria}` },
        { type: 'input_image', image_url: input.imageDataUrl, detail: cleanInspection ? 'high' : 'low' },
      ] }],
      text: { format: { type: 'json_schema', name: 'technician_observation', strict: true, schema: {
        type: 'object', additionalProperties: false,
        properties: {
          assessment: { type: 'string', enum: ['aligned', 'mistake', 'uncertain'] },
          observedAction: { type: 'string' },
          evidence: { type: 'string' },
          guidance: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['assessment', 'observedAction', 'evidence', 'guidance', 'confidence'],
      } } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `OpenAI request failed (${response.status}).`);
  return JSON.parse(outputText(result));
}

function procedureFromInput(input) {
  const steps = Array.isArray(input?.steps) ? input.steps : [];
  if (!steps.length || steps.length > 100) throw new Error('A golden run must contain between 1 and 100 steps.');
  const normalized = steps.map((step) => {
    if (typeof step === 'string') return { instruction: step.slice(0, 500), expectedAction: '', endState: '', completionCheck: '' };
    if (!step || typeof step !== 'object') throw new Error('Each golden-run step must be text or an object.');
    return {
      instruction: String(step.instruction || step.title || '').slice(0, 500),
      expectedAction: String(step.expectedAction || step.observedAction || '').slice(0, 500),
      endState: String(step.endState || step.evidence || '').slice(0, 500),
      completionCheck: String(step.completionCheck || step.evidence || '').slice(0, 500),
    };
  });
  if (normalized.some((step) => !step.instruction)) throw new Error('Every golden-run step needs an instruction.');
  return { id: String(input.id || crypto.randomUUID()).slice(0, 120), title: String(input.title || 'Golden run').slice(0, 200), steps: normalized };
}

async function createLiveCall(input) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Live voice is not configured.');
  if (typeof input?.sdp !== 'string' || input.sdp.length < 100) throw new Error('A WebRTC offer is required.');
  const instructions = String(input.instructions || '').slice(0, 4000);
  const response = await fetch('https://api.openai.com/v1/live/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json', accept: 'application/sdp' },
    body: JSON.stringify({ session: { model: 'gpt-live-1', instructions }, transport: { type: 'webrtc', sdp: input.sdp } }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Live voice request failed (${response.status}).`);
  return { sdp: payload?.transport?.sdp || '' };
}

createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (!originAllowed(request)) return json(response, 403, { error: 'This origin is not allowed.' });
  if (request.method === 'OPTIONS') return json(response, 204, {});
  if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { status: 'ok', service: 'vision-codef-gateway' });
  if (request.method === 'GET' && url.pathname === '/v1/procedures') return json(response, 200, procedures);
  if (request.method === 'GET' && url.pathname.startsWith('/v1/procedures/')) {
    const procedure = procedureStore.get(decodeURIComponent(url.pathname.slice('/v1/procedures/'.length)));
    return procedure ? json(response, 200, procedure) : json(response, 404, { error: 'Golden run was not found.' });
  }
  if (request.method === 'POST' && url.pathname === '/v1/procedures') {
    if (!withinRateLimit(request)) return json(response, 429, { error: 'Too many requests. Wait one minute and try again.' });
    try { const procedure = procedureFromInput(await body(request)); procedureStore.set(procedure.id, procedure); return json(response, 201, procedure); }
    catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : 'Golden run could not be saved.' }); }
  }
  if (request.method === 'POST' && url.pathname === '/v1/live-call') {
    if (!withinRateLimit(request)) return json(response, 429, { error: 'Too many requests. Wait one minute and try again.' });
    try { return json(response, 200, await createLiveCall(await body(request))); }
    catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : 'Live voice could not start.' }); }
  }
  if (request.method === 'POST' && url.pathname === '/v1/analyze-frame') {
    if (!withinRateLimit(request)) return json(response, 429, { error: 'Too many checks. Wait one minute and try again.' });
    try { return json(response, 200, await analyze(await body(request))); }
    catch (error) { return json(response, 400, { error: error instanceof Error ? error.message : 'Analysis failed.' }); }
  }
  return json(response, 404, { error: 'Not found.' });
}).listen(port, '0.0.0.0', () => console.log(`Vision Codef gateway listening on ${port}`));
