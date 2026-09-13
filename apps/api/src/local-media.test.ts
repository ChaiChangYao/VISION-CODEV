import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createServer, request } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_MAX_IMPORT_BYTES, importedMediaPath, MediaImportError, saveImportedMedia, sha256File } from './local-media.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local imported media storage', () => {
  it('allows recordings larger than the former 250 MiB ceiling', () => {
    expect(DEFAULT_MAX_IMPORT_BYTES).toBe(2147483648);
    expect(DEFAULT_MAX_IMPORT_BYTES).toBeGreaterThan(573464366);
  });

  it('removes a partial upload when the source disconnects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vision-codef-media-'));
    roots.push(root);
    const target = importedMediaPath(root, 'company-1', 'capture-1', 'asset-1');
    await expect(saveImportedMedia((async function* () {
      yield new Uint8Array(8);
      throw new Error('connection lost');
    })(), target)).rejects.toThrow('connection lost');
    await expect(access(target)).rejects.toBeDefined();
  });

  it('accepts the exact limit and rejects an empty upload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vision-codef-media-'));
    roots.push(root);
    expect(await saveImportedMedia((async function* () { yield new Uint8Array(8); })(), join(root, 'exact.mp4'), 8)).toBe(8);
    await expect(saveImportedMedia((async function* () {})(), join(root, 'empty.mp4'))).rejects.toMatchObject({ code: 'EMPTY_MEDIA' });
    await expect(access(join(root, 'empty.mp4'))).rejects.toBeDefined();
  });

  // Opt-in real-file check: streams through HTTP and the production storage function.
  // Never starts analysis or sends the source to an external provider.
  it.skipIf(!process.env.VISION_CODEF_TEST_LARGE_VIDEO)('streams a real large MP4 over local HTTP without changing bytes', async () => {
    const source = process.env.VISION_CODEF_TEST_LARGE_VIDEO!;
    const root = await mkdtemp(join(tmpdir(), 'vision-codef-media-'));
    roots.push(root);
    const target = importedMediaPath(root, 'company-1', 'capture-1', 'asset-1');
    const original = await stat(source);
    const server = createServer(async (incoming, response) => {
      try { const size = await saveImportedMedia(incoming, target); response.end(String(size)); }
      catch (error) { response.statusCode = 500; response.end(String(error)); }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const uploaded = new Promise<string>((resolve, reject) => {
        const outgoing = request({ hostname: '127.0.0.1', port, method: 'POST', headers: { 'content-length': original.size, 'content-type': 'video/mp4' } }, (response) => {
          let body = ''; response.setEncoding('utf8');
          response.on('data', (chunk) => { body += chunk; });
          response.on('end', () => response.statusCode === 200 ? resolve(body) : reject(new Error(body)));
          response.on('error', reject);
        });
        outgoing.on('error', reject);
        void pipeline(createReadStream(source), outgoing).catch(reject);
      });
      expect(Number(await uploaded)).toBe(original.size);
      expect((await stat(target)).size).toBe(original.size);
      expect(await sha256File(target)).toBe(await sha256File(source));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 120_000);
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
