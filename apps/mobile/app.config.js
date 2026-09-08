module.exports = ({ config }) => {
  const isLocalLanPreview = process.env.EXPO_PUBLIC_LOCAL_LAN_TEST === 'true';

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: {
            // Only the internal LAN-test APK may call the laptop's local HTTP API.
            usesCleartextTraffic: isLocalLanPreview,
          },
        },
      ],
    ],
  };
};
