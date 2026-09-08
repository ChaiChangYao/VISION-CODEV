# Timestamped Golden Run processing

The recorded-video path preserves a direct evidence chain from generated procedure steps back to the canonical MP4.

1. FFmpeg samples 160×90 grayscale frames at 2 FPS.
2. Adaptive luminance differences identify local change peaks and collapse nearby peaks into bounded events.
3. Each event receives a 1.5-second pre-roll and post-roll and eight evenly sampled 512-pixel JPEG frames.
4. The MP4 audio track is compressed to mono MP3 and transcribed with segment timestamps. Recordings without audio remain valid with an explicit `no-audio` transcript.
5. Events are sent to the configured vision provider in batches of four. Each event includes its frames, evidence timestamps, change score, and overlapping transcript text.
6. Every generated procedure step stores `evidenceStartMs`, `keyframeMs`, and `evidenceEndMs`. Selecting its review card seeks the canonical video to the keyframe and highlights the evidence window on the timeline.

The OpenAI path uses `whisper-1` verbose segment timestamps by default and structured JSON Schema output from the Responses API. Both models remain configurable through environment variables.

Model confidence is not accuracy. Report event precision, event recall, semantic step accuracy, and keyframe error only after a senior has matched predictions to a frozen annotated video set. `evaluateTimestampedPipeline` computes those metrics from explicit one-to-one reviewed matches.
