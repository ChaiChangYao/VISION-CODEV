# Physical-device capture testing

Expo Go is not an acceptance environment. Build a development client or standalone native build after `expo prebuild`; LiveKit WebRTC, native camera permissions, audio routing, and interruption handling require native modules.

## Phase 4 gate

Run on one real Android phone **or** iPhone with one Bluetooth headset and the current stable Chrome desktop browser:

1. Configure `EXPO_PUBLIC_LIVEKIT_URL`, `EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT`, `EXPO_PUBLIC_COMPANY_ID`, `EXPO_PUBLIC_MEMBER_ID`, `EXPO_PUBLIC_WORKFLOW_ID`, and `EXPO_PUBLIC_SESSION_ID` in a local, uncommitted environment.
2. Build with `pnpm --filter @vision-codef/mobile prebuild` followed by the platform development build.
3. Grant camera and microphone permissions.
4. Start a session with the rear camera in the mounted orientation.
5. Verify the phone publishes camera and microphone tracks to the LiveKit room and the desktop can monitor them.
6. Verify the screen remains awake while the session is active and that moving the app away from the foreground pauses the capture state.
7. Stop the session and verify the server reports LiveKit Egress as the canonical recording.
8. Verify no second canonical mobile recording is uploaded while Egress is healthy.

Record device model, OS, app build, LiveKit room, Egress object ID, timestamp, and any disconnect/reconnect events. Never paste access tokens into the report.

## Phase 12 gate

Repeat on physical hardware for portrait and landscape, front/rear switching, Bluetooth disconnect/reconnect, a phone call or audio interruption, and a wired headset when available. Confirm that a recovery segment is uploaded only after the server requests an Egress gap and that the original Egress object is preserved after reconciliation.

## Phase 15 compatibility matrix

| Platform | Device / OS | Bluetooth   | Wired       | Portrait    | Landscape   | Result / notes |
| -------- | ----------- | ----------- | ----------- | ----------- | ----------- | -------------- |
| Android  | _fill in_   | _pass/fail_ | _pass/fail_ | _pass/fail_ | _pass/fail_ | _fill in_      |
| iOS      | _fill in_   | _pass/fail_ | _pass/fail_ | _pass/fail_ | _pass/fail_ | _fill in_      |

If the second platform or a wired headset is unavailable, mark that compatibility row blocked; do not represent the core single-device demonstrator as failed.
