import { mkdir, readFile, open, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite } from './atomic-analysis.js';

type Entry = { id: string; label: string; reservedUsd: number; actualUsd?: number };
type Ledger = { entries: Entry[] };
export class ApiBudgetExceededError extends Error {}
// Full 400k input context ($0.10) + capped 6k output ($0.012), rounded up.
// Includes failed/uncertain responses at their full reserved bound. No tools enabled.
export const MINI_REQUEST_RESERVATION_USD = 0.12;
export async function withApiBudget<T>(
  path: string,
  capUsd: number,
  label: string,
  operation: () => Promise<T>,
  cost: (result: T) => number | undefined,
  reservationUsd = MINI_REQUEST_RESERVATION_USD,
): Promise<T> {
  if (!Number.isFinite(capUsd) || capUsd <= 0)
    throw new ApiBudgetExceededError('Invalid API spending cap.');
  if (!Number.isFinite(reservationUsd) || reservationUsd <= 0)
    throw new ApiBudgetExceededError('Invalid reservation.');
  await mkdir(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  let handle;
  try {
    handle = await open(lock, 'wx');
  } catch {
    throw new ApiBudgetExceededError(
      'API budget ledger is locked by another run. Retry after it completes; investigate stale locks before removal.',
    );
  }
  try {
    let ledger: Ledger = { entries: [] };
    try {
      ledger = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (
      !Array.isArray(ledger.entries) ||
      ledger.entries.some(
        (entry) =>
          !Number.isFinite(entry.reservedUsd) ||
          entry.reservedUsd < 0 ||
          (entry.actualUsd !== undefined &&
            (!Number.isFinite(entry.actualUsd) || entry.actualUsd < 0)),
      )
    )
      throw new Error('Invalid budget ledger.');
    const spent = ledger.entries.reduce(
      (sum, entry) => sum + (entry.actualUsd ?? entry.reservedUsd),
      0,
    );
    if (spent + reservationUsd > capUsd)
      throw new ApiBudgetExceededError(
        `API budget limit reached. Accounted $${spent.toFixed(4)} of $${capUsd.toFixed(2)}; completed windows are preserved.`,
      );
    const entry: Entry = { id: randomUUID(), label, reservedUsd: reservationUsd };
    ledger.entries.push(entry);
    await atomicWrite(path, ledger);
    const result = await operation();
    const actual = cost(result);
    if (actual !== undefined && Number.isFinite(actual) && actual >= 0) entry.actualUsd = actual;
    await atomicWrite(path, ledger);
    return result;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
