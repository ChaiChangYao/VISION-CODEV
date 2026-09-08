import { fileModelPath } from 'react-native-sherpa-onnx';
import { createStreamingTTS } from 'react-native-sherpa-onnx/tts';

import { LocalGuidanceSpeaker } from './localGuidanceSpeaker';

export type SherpaGuidanceSpeakerOptions = {
  modelDirectory: string;
  numThreads?: number;
};

export function createSherpaGuidanceSpeaker(
  options: SherpaGuidanceSpeakerOptions,
): LocalGuidanceSpeaker {
  const modelDirectory = options.modelDirectory.trim();
  if (!modelDirectory)
    throw new Error('EXPO_PUBLIC_TTS_MODEL_PATH must point to an installed Piper/VITS model directory.');

  return new LocalGuidanceSpeaker(() =>
    createStreamingTTS({
      modelPath: fileModelPath(modelDirectory),
      modelType: 'vits',
      provider: 'cpu',
      numThreads: options.numThreads ?? 2,
      silenceScale: 0.1,
    }),
  );
}
