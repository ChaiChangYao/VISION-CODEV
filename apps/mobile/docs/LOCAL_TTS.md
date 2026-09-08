# Local guidance TTS

LiveKit remains the source of truth for procedure guidance and the camera/microphone transport.
The trusted LiveKit participant with `attributes.role = guidance` sends a UTF-8 data packet on
the `vision-codef.guidance` topic. The phone accepts only these packets:

```json
{"type":"speak","text":"Stop and align the left corner.","priority":"urgent"}
{"type":"interrupt"}
```

When `EXPO_PUBLIC_TTS_MODEL_PATH` is configured, the phone does not subscribe to the remote
guidance audio track. It renders trusted LiveKit guidance text through local Sherpa-ONNX TTS and
the active phone route, including a paired Bluetooth headset. Without a local model, the existing
LiveKit guidance-audio track remains the fallback.

## Model setup

Install a small, licensed Piper/VITS model into the phone sandbox, then set
`EXPO_PUBLIC_TTS_MODEL_PATH` to its absolute directory. The directory must include the model
`.onnx` file, `tokens.txt`, and `espeak-ng-data`. Do not commit model weights to this repository;
record the model licence before distribution.

New guidance interrupts old guidance so delayed instructions are never spoken after the procedure
state changes. Run a native development build after installing the dependency; Expo Go cannot load
the Sherpa native module.

On iOS, validate Bluetooth headset playback while the LiveKit microphone is publishing. Both
libraries touch `AVAudioSession`; this must pass the physical-device acceptance gate before
claiming full-duplex headset guidance is supported.
