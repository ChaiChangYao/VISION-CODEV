declare module 'expo-file-system/legacy' {
  export const cacheDirectory: string | null;
  export const EncodingType: { Base64: 'base64' };
  export function makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  export function writeAsStringAsync(uri: string, contents: string, options?: { encoding?: 'base64' }): Promise<void>;
  export function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}

