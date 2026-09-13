# Large MP4 import

The browser and default API ceiling are now 2 GiB (2,147,483,648 bytes). The API's existing VISION_CODEF_MAX_IMPORT_BYTES setting can impose a different server limit; the browser ceiling remains 2 GiB. Deployments with an old explicit 262144000 override must update it. The local installation has no such override.

Uploads stream to disk. Each chunk is fully written before reading the next, preserving backpressure without buffering the entire MP4. Size enforcement and empty/interrupted-upload cleanup remain enabled. HTTP request-body timeout is bounded at 30 minutes rather than the default five minutes. This does not implement resumable uploads; an interrupted upload must be selected again.

Verified September 11, 2026:
- WIN_20260911_16_36_45_Pro.mp4: 573,464,366 bytes; 4m15.31s; 1080p H.264/AAC.
- Full file streamed through a loopback HTTP server and the production saveImportedMedia function. Stored size and SHA-256 matched the source. Temporary copy removed by test cleanup; original untouched.
- Local FFmpeg decoded the first second successfully.
- 7 targeted storage tests passed with the real-file test enabled. Full API suite: 37 passed, opt-in large-file test skipped in that second run. Web: 19 passed. API and production web builds passed.
- No external upload, paid analysis, or modification of an existing workflow performed for verification. Canonical-storage transfer and model analysis of this example were not exercised by the loopback test.

To repeat the local large-file check, set VISION_CODEF_TEST_LARGE_VIDEO to an MP4 path and run the API local-media.test.ts suite. The test does not invoke processing providers.
