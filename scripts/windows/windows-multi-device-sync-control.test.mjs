import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runWindowsMultiDeviceSyncControl } from './windows-multi-device-sync-control.mjs';

it('pushes dev and copies only the fixed C receipt', async () => {
  const executeGit = vi.fn(async () => 'pushed');
  const executeScp = vi.fn(async () => 'copied');
  const executeSsh = vi.fn(async () => '[windows-dev-action] multi-device-sync-c '
    + 'identity=run-1 manifest=C:\\dev\\foliole-android-lab-preview\\.tmp\\artifacts\\'
    + 'windows-dev-action\\run-1\\sync-group-recovery-receipt.json\n');
  const result = await runWindowsMultiDeviceSyncControl({
    buildPushSpec: () => ({ args: ['push'], env: { GIT: 'fixed' } }),
    buildScpSpec: (_host, remote, local) => [remote, local],
    buildSshSpec: () => ['ssh'], env: {}, executeGit, executeScp, executeSsh,
    fsApi: { mkdirSync: vi.fn() }, host: 'user@host', repoRoot: '/repo', stdout: { write: vi.fn() }
  });
  expect(result.manifestPath).toBe(path.join('/repo', '.tmp', 'artifacts',
    'multi-device-sync', 'windows-c', 'run-1', 'multi-device-sync-c-receipt.json'));
  expect(executeGit).toHaveBeenCalledTimes(1);
  expect(executeScp).toHaveBeenCalledTimes(1);
});

it('copies only the fixed A-rejoin receipt', async () => {
  const executeScp = vi.fn(async () => 'copied');
  const executeSsh = vi.fn(async () => '[windows-dev-action] multi-device-sync-a-rejoin '
    + 'identity=run-2 manifest=C:\\dev\\foliole-android-lab-preview\\.tmp\\artifacts\\'
    + 'windows-dev-action\\run-2\\multi-device-sync-a-rejoin-receipt.json\n');
  const result = await runWindowsMultiDeviceSyncControl({ action: 'multi-device-sync-a-rejoin',
    buildPushSpec: () => ({ args: ['push'], env: {} }), buildScpSpec: (_host, remote, local) => [remote, local],
    buildSshSpec: () => ['ssh'], env: {}, executeGit: vi.fn(async () => ''), executeScp,
    executeSsh, fsApi: { mkdirSync: vi.fn() }, host: 'user@host', repoRoot: '/repo',
    stdout: { write: vi.fn() } });
  expect(result.manifestPath).toBe(path.join('/repo', '.tmp', 'artifacts',
    'multi-device-sync', 'windows-c', 'run-2', 'multi-device-sync-a-rejoin-receipt.json'));
});

it('copies only the fixed A-leave receipt', async () => {
  const progress = '[windows-dev-action] progress action=multi-device-sync-a-leave '
    + 'nonce=12345678-1234-1234-1234-123456789abc milestone=c-fact-created '
    + 'fact=multi-device-sync-c-20260813080000000\n';
  const receipt = '[windows-dev-action] multi-device-sync-a-leave '
    + 'identity=run-3 manifest=C:\\dev\\foliole-android-lab-preview\\.tmp\\artifacts\\'
    + 'windows-dev-action\\run-3\\multi-device-sync-a-leave-receipt.json\n';
  const executeSsh = vi.fn(async (_args, options) => {
    options.onOutput(progress); options.onOutput(receipt); return `${progress}${receipt}`;
  });
  const stdout = { write: vi.fn() };
  const result = await runWindowsMultiDeviceSyncControl({ action: 'multi-device-sync-a-leave',
    buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, remote, local) => [remote, local], buildSshSpec: () => ['ssh'],
    env: {}, executeGit: vi.fn(async () => ''), executeScp: vi.fn(async () => 'copied'),
    executeSsh, fsApi: { mkdirSync: vi.fn() }, host: 'user@host', repoRoot: '/repo',
    stdout });
  expect(result.manifestPath).toBe(path.join('/repo', '.tmp', 'artifacts',
    'multi-device-sync', 'windows-c', 'run-3', 'multi-device-sync-a-leave-receipt.json'));
  expect(stdout.write.mock.calls.map(([value]) => value).join('')).toBe(`${progress}${receipt}`);
});
