import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { importedMediaPath, MediaImportError, saveImportedMedia, sha256File } from './local-media.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local imported media storage', () => {
  it('writes an uploaded stream only beneath its tenant capture directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vision-codef-media-'));
    roots.push(root);
    const target = importedMediaPath(root, 'company-1', 'capture-1', 'asset-1');
    const size = await saveImportedMedia((async function* () { yield Uint8Array.from([1, 2]); yield Uint8Array.from([3, 4]); })(), target, 16);
    expect(size).toBe(4);
    expect([...await readFile(target)]).toEqual([1, 2, 3, 4]);
    expect(await sha256File(target)).toBe('9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a');
    expect(target.startsWith(root)).toBe(true);
  });

  it('removes a partial file when the configured upload limit is exceeded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vision-codef-media-'));
    roots.push(root);
    const target = importedMediaPath(root, 'company-1', 'capture-1', 'asset-1');
    await expect(saveImportedMedia((async function* () { yield new Uint8Array(8); })(), target, 4)).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' } satisfies Partial<MediaImportError>);
    await expect(access(target)).rejects.toBeDefined();
  });

  it('rejects identifiers that could escape the configured root', () => {
    expect(() => importedMediaPath('C:\\media', '..', 'capture', 'asset')).toThrow(MediaImportError);
  });
});
