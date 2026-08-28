import * as FileSystem from 'expo-file-system';

import type { RecoveryBufferEntry, RecoveryBufferStore } from './rollingRecoveryBuffer';
import type { RecoverySegment } from '../types';

const ROOT = `${FileSystem.cacheDirectory ?? ''}vision-codef-recovery/`;

function uriFor(segment: RecoverySegment): string {
  return `${ROOT}${segment.id}.segment`;
}

function manifestUriFor(segment: RecoverySegment): string {
  return `${ROOT}${segment.id}.json`;
}

/** Expo-prebuild-compatible bounded-file store for the rolling recovery window. */
export class FileSystemRecoveryStore implements RecoveryBufferStore {
  async put(segment: RecoverySegment, bytes: Uint8Array): Promise<void> {
    await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
    const base64 = uint8ArrayToBase64(bytes);
    await FileSystem.writeAsStringAsync(uriFor(segment), base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(manifestUriFor(segment), JSON.stringify(segment));
  }

  async remove(segment: RecoverySegment): Promise<void> {
    await Promise.all([
      FileSystem.deleteAsync(uriFor(segment), { idempotent: true }),
      FileSystem.deleteAsync(manifestUriFor(segment), { idempotent: true }),
    ]);
  }

  async load(): Promise<RecoveryBufferEntry[]> {
    try {
      const files = await FileSystem.readDirectoryAsync(ROOT);
      const entries: RecoveryBufferEntry[] = [];
      for (const file of files.filter((value) => value.endsWith('.json'))) {
        try {
          const manifest = JSON.parse(
            await FileSystem.readAsStringAsync(`${ROOT}${file}`),
          ) as unknown;
          if (!isRecoverySegment(manifest)) continue;
          const encoded = await FileSystem.readAsStringAsync(uriFor(manifest), {
            encoding: FileSystem.EncodingType.Base64,
          });
          const bytes = base64ToUint8Array(encoded);
          if (bytes.byteLength !== manifest.byteLength) continue;
          entries.push({ segment: manifest, bytes });
        } catch {
          // A partial or corrupt manifest is ignored; the rolling window is best effort.
        }
      }
      return entries;
    } catch {
      // The cache directory may not exist on a new install or a cleared cache.
      return [];
    }
  }
}

function isRecoverySegment(value: unknown): value is RecoverySegment {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.sessionId === 'string' &&
    typeof item.sequence === 'number' &&
    typeof item.startedAtMs === 'number' &&
    typeof item.endedAtMs === 'number' &&
    typeof item.mimeType === 'string' &&
    typeof item.byteLength === 'number' &&
    typeof item.sha256 === 'string' &&
    typeof item.localUri === 'string'
  );
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return globalThis.btoa(binary);
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
