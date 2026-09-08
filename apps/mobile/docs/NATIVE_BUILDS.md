# Native builds

This app cannot run in Expo Go because LiveKit WebRTC and Sherpa-ONNX TTS contain native code.
Use Expo Application Services (EAS) for cloud builds; it works from Windows and does not require
local Android Studio or Xcode for the build itself.

## Android APK

The first time, authenticate and link this app to the team's Expo account:

```powershell
cd apps/mobile
npx eas-cli login
npx eas-cli init
```

Then create an installable APK for a physical-device test:

```powershell
npx eas-cli build --platform android --profile preview
```

EAS returns a download link. Install that APK on the test phone. Use the `development` profile
instead when the app needs to connect to the local Expo development server.

## iPhone

EAS can build iOS from Windows, but Apple signing remains required. The Expo account needs access
to an Apple Developer team, and the target device must be registered for an internal build or the
app must be distributed through TestFlight. After the first credential setup, use:

```powershell
npx eas-cli build --platform ios --profile preview
```

The resulting `.ipa` is not directly installable on arbitrary iPhones. Use an internal/ad hoc
distribution with registered devices or TestFlight.
