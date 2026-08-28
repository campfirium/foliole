// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import { runWindowsDesktopDnsSdRouteSelfcheck } from
  './windows-desktop-dnssd-route-selfcheck.mjs';

it('requires separate nonce-bound negative and positive worker terminals', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'route-selfcheck-'));
  const waitForResult = vi.fn()
    .mockResolvedValueOnce({ error: 'missing runtime', exitCode: 1, nonce: 'negative',
      state: 'completed', workerPid: 101 })
    .mockResolvedValueOnce({ actionResult: { desktopDnsSdRouteSelfcheck: {
      manifestPath: 'native.json' } }, exitCode: 0, nonce: 'positive',
      state: 'completed', workerPid: 102 });
  const result = await runWindowsDesktopDnsSdRouteSelfcheck({
    buildIdentity: 'build-1', evidenceRoot, execute: vi.fn(async () => ({ code: 0 })),
    paths: { repoRoot: evidenceRoot }, runtimeRepoRoot: 'owned/source'
  }, { installTask: vi.fn(), waitForResult, waitForWorkerExit: vi.fn() });
  const receipt = JSON.parse(fs.readFileSync(
    result.desktopDnsSdRouteControllerSelfcheck.manifestPath, 'utf8'
  ));
  expect(receipt).toMatchObject({ negative: { exitCode: 1, nonce: 'negative' },
    positive: { exitCode: 0, nonce: 'positive' }, resultStatus: 'success' });
  expect(waitForResult).toHaveBeenCalledTimes(2);
});
