import * as FileSystem from 'expo-file-system/legacy';

import type { RecoveryBufferStore } from './rollingRecoveryBuffer';
import type { RecoverySegment } from '../types';

const ROOT = `${FileSystem.cacheDirectory ?? ''}vision-codef-recovery/`;

function uriFor(segment: RecoverySegment): string {
  return `${ROOT}${segment.id}.segment`;
}

/** Expo-prebuild-compatible bounded-file store for the rolling recovery window. */
export class FileSystemRecoveryStore implements RecoveryBufferStore {
  async put(segment: RecoverySegment, bytes: Uint8Array): Promise<void> {
    await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
    const base64 = uint8ArrayToBase64(bytes);
    await FileSystem.writeAsStringAsync(uriFor(segment), base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  async remove(segment: RecoverySegment): Promise<void> {
    await FileSystem.deleteAsync(uriFor(segment), { idempotent: true });
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return globalThis.btoa(binary);
}
