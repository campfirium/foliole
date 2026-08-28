// @vitest-environment node
/* global process */

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
  const workerScript = path.join(evidenceRoot, 'scripts', 'windows',
    'windows-sync-group-interactive-worker.mjs');
  const execute = vi.fn(async (_bin, args) => args.includes('/Query')
    ? { code: 0, output: `<Task><Actions><Exec><Command>${process.execPath}</Command>`
      + `<Arguments>&quot;${workerScript}&quot;</Arguments>`
      + `<WorkingDirectory>${evidenceRoot}</WorkingDirectory></Exec></Actions></Task>` }
    : { code: 0 });
  const result = await runWindowsDesktopDnsSdRouteSelfcheck({
    buildIdentity: 'build-1', evidenceRoot, execute,
    paths: { repoRoot: evidenceRoot }
  }, { installTask: vi.fn(), waitForResult, waitForWorkerExit: vi.fn() });
  const receipt = JSON.parse(fs.readFileSync(
    result.desktopDnsSdRouteControllerSelfcheck.manifestPath, 'utf8'
  ));
  expect(receipt).toMatchObject({ negative: { exitCode: 1, nonce: 'negative' },
    positive: { exitCode: 0, nonce: 'positive' }, resultStatus: 'success',
    taskAction: { resultStatus: 'verified', workerScript } });
  expect(waitForResult).toHaveBeenCalledTimes(2);
  expect(execute).toHaveBeenCalledWith('schtasks.exe',
    ['/Query', '/TN', 'FolioleNativeClient', '/XML'], expect.any(Object));
});
