import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planAnalysisWindows, runAtomicWindows, validateAtomicResult } from './atomic-analysis.js';
import { withApiBudget } from './api-budget.js';
describe('senior pipeline', () => {
  it('covers the whole recording beyond the previous 12-event cap', () => {
    const windows = planAnalysisWindows(120_500);
    expect(windows.length).toBe(31);
    expect(windows[0]!.coreStartMs).toBe(0);
    expect(windows.at(-1)!.coreEndMs).toBe(120_500);
    windows
      .slice(1)
      .forEach((window, index) => expect(window.coreStartMs).toBe(windows[index]!.coreEndMs));
  });
  it('resumes completed windows without repeating API work', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'senior-test-'));
    const windows = planAnalysisWindows(8000);
    let calls = 0;
    await expect(
      runAtomicWindows(windows, dir, async () => {
        calls++;
        if (calls === 2) throw new Error('network');
        return { summary: 'first', actions: [] };
      }),
    ).rejects.toThrow('network');
    await runAtomicWindows(windows, dir, async () => {
      calls++;
      return { summary: 'second', actions: [] };
    });
    expect(calls).toBe(3);
  });
  it('rejects fabricated out-of-window timestamps', () => {
    expect(() =>
      validateAtomicResult(
        { summary: '', actions: [{ startMs: -1, endMs: 1 }] },
        planAnalysisWindows(8000)[0]!,
      ),
    ).toThrow('timestamps');
  });
  it('counts uncertain failures against the cap and blocks before a paid call', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'budget-test-'));
    const path = join(dir, 'ledger.json');
    await expect(
      withApiBudget(
        path,
        0.2,
        'failed',
        async () => {
          throw new Error('timeout');
        },
        () => 0,
      ),
    ).rejects.toThrow('timeout');
    let called = false;
    await expect(
      withApiBudget(
        path,
        0.2,
        'blocked',
        async () => {
          called = true;
        },
        () => 0,
      ),
    ).rejects.toThrow('budget limit');
    expect(called).toBe(false);
    expect(JSON.parse(await readFile(path, 'utf8')).entries).toHaveLength(1);
  });
});
