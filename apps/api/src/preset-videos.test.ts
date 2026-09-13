import { describe, expect, it } from 'vitest';
import { findPresetVideo, presetVideos } from './preset-videos.js';

describe('preset video library', () => {
  it('only includes source recordings, never annotated UI videos', () => {
    expect(presetVideos).toHaveLength(4);
    expect(new Set(presetVideos.map((video) => video.id)).size).toBe(4);
    for (const video of presetVideos) expect(video.filename).toMatch(/-source-with-silent-audio\.mp4$/);
  });
  it('rejects paths and unknown names instead of exposing arbitrary files', async () => {
    for (const id of ['../.env', 'automotive/../rubber', 'missing', '']) expect(await findPresetVideo(id)).toBeUndefined();
  });
});
