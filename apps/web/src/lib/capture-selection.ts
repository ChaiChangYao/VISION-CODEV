import type { CaptureSessionView } from './api-client';

/**
 * Keep abandoned pairing attempts from hiding preserved evidence.
 * The API returns newest-first, so this only moves expired, media-less
 * preparation sessions behind captures that contain usable work.
 */
export function prioritizeCaptureSessions(
  captures: CaptureSessionView[],
  currentTimeMs = Date.now(),
): CaptureSessionView[] {
  const usable: CaptureSessionView[] = [];
  const abandoned: CaptureSessionView[] = [];

  for (const capture of captures) {
    if (isExpiredEmptyPreparation(capture, currentTimeMs)) abandoned.push(capture);
    else usable.push(capture);
  }

  return usable.length > 0 ? [...usable, ...abandoned] : [...captures];
}

function isExpiredEmptyPreparation(capture: CaptureSessionView, currentTimeMs: number) {
  if (capture.state !== 'preparing' || capture.mediaAsset) return false;
  if (!capture.pairingExpiresAt) return false;
  const expiresAt = Date.parse(capture.pairingExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= currentTimeMs;
}
