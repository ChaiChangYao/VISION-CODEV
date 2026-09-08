import { mkdir, open, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';

export const DEFAULT_MAX_IMPORT_BYTES = 250 * 1024 * 1024;

export class MediaImportError extends Error {
  public constructor(
    readonly code: 'EMPTY_MEDIA' | 'MEDIA_TOO_LARGE' | 'INVALID_MEDIA_PATH',
    message: string,
  ) {
    super(message);
  }
}

export function localMediaRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.VISION_CODEF_LOCAL_MEDIA_DIR?.trim()) return resolve(env.VISION_CODEF_LOCAL_MEDIA_DIR.trim());
  if (env.NODE_ENV === 'production') {
    throw new MediaImportError(
      'INVALID_MEDIA_PATH',
      'VISION_CODEF_LOCAL_MEDIA_DIR must be configured before local imports can be used in production.',
    );
  }
  return resolve(process.cwd(), '.vision-codef', 'media');
}

export function importedMediaPath(root: string, companyId: string, captureId: string, assetId: string): string {
  const safeSegment = /^[a-zA-Z0-9-]+$/;
  if (![companyId, captureId, assetId].every((value) => safeSegment.test(value))) {
    throw new MediaImportError('INVALID_MEDIA_PATH', 'Media ownership identifiers contain unsupported characters.');
  }
  const normalizedRoot = resolve(root);
  const target = resolve(normalizedRoot, companyId, captureId, `${assetId}.mp4`);
  if (!target.startsWith(normalizedRoot + sep)) {
    throw new MediaImportError('INVALID_MEDIA_PATH', 'The imported media path escaped the configured media directory.');
  }
  return target;
}

export async function saveImportedMedia(
  body: AsyncIterable<Uint8Array | string>,
  target: string,
  maxBytes = DEFAULT_MAX_IMPORT_BYTES,
): Promise<number> {
  await mkdir(dirname(target), { recursive: true });
  const handle = await open(target, 'wx');
  let bytesWritten = 0;
  let closed = false;
  try {
    for await (const value of body) {
      const chunk = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
      bytesWritten += chunk.byteLength;
      if (bytesWritten > maxBytes) {
        throw new MediaImportError('MEDIA_TOO_LARGE', `Imported videos must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`);
      }
      await handle.write(chunk);
    }
    if (bytesWritten === 0) throw new MediaImportError('EMPTY_MEDIA', 'The imported video is empty.');
    return bytesWritten;
  } catch (error) {
    await handle.close();
    closed = true;
    await rm(target, { force: true });
    throw error;
  } finally {
    if (!closed) await handle.close();
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
