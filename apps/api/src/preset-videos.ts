import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const presetVideos = [
  { id: 'rubber', title: 'Rubber workshop', filename: 'rubber-source-with-silent-audio.mp4' },
  { id: 'automotive', title: 'Automotive coating', filename: 'automotive-source-with-silent-audio.mp4' },
  { id: 'electronics', title: 'Electronics assembly', filename: 'electronics-source-with-silent-audio.mp4' },
  { id: 'auto-repair', title: 'Vehicle repair', filename: 'auto-repair-source-with-silent-audio.mp4' },
] as const;

export async function findPresetVideo(id: string) {
  const preset = presetVideos.find((video) => video.id === id);
  if (!preset) return undefined;
  const root = process.env.VISION_CODEF_PRESET_MEDIA_DIR?.trim() || fileURLToPath(new URL('../../../../Research/Vision Lab Samples/', import.meta.url));
  const path = resolve(root, preset.filename);
  const info = await stat(path).catch(() => undefined);
  return info?.isFile() ? { ...preset, path, sizeBytes: info.size } : undefined;
}

export async function listPresetVideos() {
  return Promise.all(presetVideos.map(async (preset) => {
    const file = await findPresetVideo(preset.id);
    return { ...preset, available: Boolean(file), sizeBytes: file?.sizeBytes, hasNarration: false };
  }));
}
