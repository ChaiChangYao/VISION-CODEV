import { readFile } from 'node:fs/promises';

export type TranscriptSegment = { startMs: number; endMs: number; text: string };
export type TimestampedTranscript = {
  text: string;
  status: 'completed' | 'no-audio' | 'not-configured';
  language?: string;
  segments: TranscriptSegment[];
};

export async function transcribeWithOpenAI(
  audioPath: string,
  options: { apiKey?: string; baseUrl: string; model?: string },
  fetcher: typeof fetch = fetch,
): Promise<TimestampedTranscript> {
  if (!options.apiKey) return { text: '', status: 'not-configured', segments: [] };
  const bytes = new Uint8Array(await readFile(audioPath));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'golden-run.mp3');
  form.append('model', options.model ?? 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  const response = await fetcher(`${options.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!response.ok) throw new Error(`OpenAI transcription failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as { text?: string; language?: string; segments?: Array<{ start?: number; end?: number; text?: string }> };
  return {
    text: String(payload.text ?? '').trim(),
    status: 'completed',
    language: payload.language,
    segments: (payload.segments ?? []).flatMap((segment) => {
      const text = String(segment.text ?? '').trim();
      const startMs = Math.max(0, Math.round(Number(segment.start ?? 0) * 1000));
      const endMs = Math.max(startMs + 1, Math.round(Number(segment.end ?? segment.start ?? 0) * 1000));
      return text ? [{ startMs, endMs, text }] : [];
    }),
  };
}

export function transcriptForWindow(transcript: TimestampedTranscript, startMs: number, endMs: number): string {
  return transcript.segments
    .filter((segment) => segment.endMs >= startMs && segment.startMs <= endMs)
    .map((segment) => segment.text)
    .join(' ')
    .trim();
}
