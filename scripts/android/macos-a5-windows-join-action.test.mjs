/* global process */

import { expect, it, vi } from 'vitest';

import { runFixedA5WindowsJoin } from './macos-a5-windows-join-action.mjs';

it('keeps Android approval active while the fixed Windows recovery runs', async () => {
  const executeProcess = vi.fn(async () => ({ code: 0, output: 'windows-complete\n' }));
  const runApproval = vi.fn(async ({ onReady }) => {
    await onReady();
    return { output: 'android-approved\n' };
  });

  await expect(runFixedA5WindowsJoin({ executeProcess, repoRoot: '/repo', runApproval }))
    .resolves.toEqual({ output: 'android-approved\nwindows-complete\n' });
  expect(executeProcess).toHaveBeenCalledWith(process.execPath, [
    '/repo/scripts/windows/windows-dev-control.mjs', 'sync-group-recover'
  ], { cwd: '/repo' });
});
