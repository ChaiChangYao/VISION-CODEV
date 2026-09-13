module.exports = ({ config }) => {
  const isLocalLanPreview = process.env.EXPO_PUBLIC_LOCAL_LAN_TEST === 'true';
  const androidBuildArch = process.env.EXPO_PUBLIC_ANDROID_BUILD_ARCH;

  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      livekitServerUrl: process.env.EXPO_PUBLIC_LIVEKIT_URL,
      ttsModelPath:
        process.env.EXPO_PUBLIC_TTS_MODEL_PATH ||
        'asset:models/vits-piper-en_US-amy-low',
    },
    plugins: [
      ...(config.plugins ?? []),
      './plugins/withTtsModel',
      [
        'expo-build-properties',
        {
          android: {
            // Only the internal LAN-test APK may call the laptop's local HTTP API.
            usesCleartextTraffic: isLocalLanPreview,
            // Internal device testing targets current Android phones. Avoid
            // shipping four copies of the large native TTS/runtime libraries.
            buildArchs: androidBuildArch
              ? [androidBuildArch]
              : isLocalLanPreview
                ? ['arm64-v8a']
                : undefined,
            enableBundleCompression: isLocalLanPreview,
          },
        },
      ],
    ],
  };
};
