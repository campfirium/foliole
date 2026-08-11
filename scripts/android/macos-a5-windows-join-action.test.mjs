/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runFixedA5WindowsJoin } from './macos-a5-windows-join-action.mjs';

it('keeps Android approval active while the fixed Windows recovery runs', async () => {
  const approvalSource = fs.readFileSync('scripts/android/macos-a5-sync-group-approval.mjs', 'utf8');
  const executeProcess = vi.fn(async () => ({ code: 0, output: 'windows-complete\n' }));
  const writeWindowsLog = vi.fn();
  const runApproval = vi.fn(async ({ onReady }) => {
    await onReady();
    return { output: 'android-approved\n' };
  });

  await expect(runFixedA5WindowsJoin({
    executeProcess, repoRoot: '/repo', runApproval, writeWindowsLog
  }))
    .resolves.toEqual({ output: 'android-approved\nwindows-complete\n' });
  expect(executeProcess).toHaveBeenCalledWith(process.execPath, [
    path.join('/repo', 'scripts/windows/windows-dev-control.mjs'), 'sync-group-recover'
  ], { cwd: '/repo' });
  expect(writeWindowsLog).toHaveBeenCalledWith(
    path.join('/repo', '.tmp/artifacts/a5-sync-group-approval/windows-control.log'), 'windows-complete\n'
  );
  expect(approvalSource).toContain('const reuseInstalledMain = await installedMainMatches');
  expect(approvalSource).toContain('if (!reuseInstalledMain)');
  expect(approvalSource).not.toContain('protectData(');
});
