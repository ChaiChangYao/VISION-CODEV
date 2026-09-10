import { config } from 'dotenv';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { processSeniorVideo, seniorGraph, inspectMedia } from './senior-processing.js';
import { atomicWrite } from './atomic-analysis.js';
import { visionProviderConfig } from './vision-provider.js';
const root = resolve('../..');
config({ path: join(root, '.env'), quiet: true });
const sampleRoot = resolve(root, '../Research/Vision Lab Samples');
const out = join(root, '.run/senior-evaluation');
await mkdir(out, { recursive: true });
const provider = visionProviderConfig();
provider.provider = 'openai';
provider.model = 'gpt-5-mini';
const names = ['rubber', 'automotive', 'electronics', 'auto-repair'];
for (const name of names) {
  const path = join(sampleRoot, `${name}-source-with-silent-audio.mp4`);
  const info = await inspectMedia(path);
  if (info.hasSound)
    throw new Error('Evaluation expected silent source media. Refusing to discard narration.');
  const started = Date.now();
  const result = await processSeniorVideo({
    path,
    cacheRoot: join(out, 'cache'),
    budgetPath: join(root, '.run/local-processing/senior-api-budget.json'),
    capUsd: 10,
    config: provider,
    transcript: { text: '', status: 'no-audio', segments: [] },
    progress: async (completed, total) => {
      console.log(`${name}: ${completed}/${total} windows`);
    },
  });
  await atomicWrite(join(out, `${name}.json`), {
    ...result,
    elapsedMs: Date.now() - started,
    graph: seniorGraph(result),
  });
  console.log(`${name}: ${result.actions.length} actions, ${Date.now() - started}ms`);
}
