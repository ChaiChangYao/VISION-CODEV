import { TurboModuleRegistry, type TurboModule } from 'react-native';
import { assetModelPath, fileModelPath } from 'react-native-sherpa-onnx';
import { createTTS } from 'react-native-sherpa-onnx/tts';

import { LocalGuidanceSpeaker, type LocalGuidanceEngine } from './localGuidanceSpeaker';

export type SherpaGuidanceSpeakerOptions = {
  modelDirectory: string;
  numThreads?: number;
};

type SherpaPcmModule = TurboModule & {
  startTtsPcmPlayer(instanceId: string, sampleRate: number, channels: number): Promise<void>;
  writeTtsPcmChunk(instanceId: string, samples: number[]): Promise<void>;
  stopTtsPcmPlayer(instanceId: string): Promise<void>;
};

export function createSherpaGuidanceSpeaker(
  options: SherpaGuidanceSpeakerOptions,
): LocalGuidanceSpeaker {
  const modelDirectory = options.modelDirectory.trim();
  if (!modelDirectory)
    throw new Error('EXPO_PUBLIC_TTS_MODEL_PATH must point to an installed Piper/VITS model directory.');

  const modelPath = modelDirectory.startsWith('asset:')
    ? assetModelPath(modelDirectory.slice('asset:'.length))
    : fileModelPath(modelDirectory);

  return new LocalGuidanceSpeaker(async (): Promise<LocalGuidanceEngine> => {
    const tts = await createTTS({
      modelPath,
      modelType: 'vits',
      provider: 'cpu',
      numThreads: options.numThreads ?? 2,
      silenceScale: 0.1,
    });
    const pcm = TurboModuleRegistry.getEnforcing<SherpaPcmModule>('SherpaOnnx');
    return {
      generateSpeech: (text, generationOptions) => tts.generateSpeech(text, generationOptions),
      startPcmPlayer: (sampleRate, channels) =>
        pcm.startTtsPcmPlayer(tts.instanceId, sampleRate, channels),
      writePcmChunk: (samples) => pcm.writeTtsPcmChunk(tts.instanceId, samples),
      stopPcmPlayer: () => pcm.stopTtsPcmPlayer(tts.instanceId),
      destroy: () => tts.destroy(),
    };
  });
}
