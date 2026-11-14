// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';
import { readDesktopTimeoutHistory, timeoutFromSamples } from './desktop-file-timeout-history.mjs';

it('uses the agreed default, single sample floor and observed range', () => {
  expect(timeoutFromSamples([])).toBe(480_000);
  expect(timeoutFromSamples([165_250])).toBe(480_000);
  expect(timeoutFromSamples([480_001])).toBe(600_000);
  expect(timeoutFromSamples([138_690, 165_250])).toBe(240_000);
  expect(timeoutFromSamples([75_080, 113_160])).toBe(180_000);
  expect(timeoutFromSamples([900_000, 1_200_000])).toBe(1_500_000);
});

it('feeds later runs with recent completed reports by platform without counting retries twice', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'desktop-timeout-history-'));
  try {
    function record(run, attempt, platform, durationMs, status = 'passed') {
      const dir = path.join(root, String(run), `desktop-source-${platform}-one-sha-${attempt}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'file.execution.json'), JSON.stringify({
        file: 'src/app/file.test.ts', platform, durationMs, status
      }));
    }
    for (let run = 1; run <= 11; run++) record(run, 1, 'linux', run * 1000);
    record(11, 2, 'linux', 20_000);
    record(12, 1, 'linux', 480_000, 'timeout');
    record(11, 1, 'win32', 165_250);
    expect([...readDesktopTimeoutHistory(root, 'linux').values()]).toEqual([
      [20_000, 10_000, 9_000, 8_000, 7_000, 6_000, 5_000, 4_000, 3_000, 2_000]
    ]);
    expect([...readDesktopTimeoutHistory(root, 'win32').values()]).toEqual([[165_250]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
