import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runWindowsMultiDeviceSyncControl } from './windows-multi-device-sync-control.mjs';

it('pushes dev and copies only the fixed C receipt', async () => {
  const executeGit = vi.fn(async () => 'pushed');
  const executeScp = vi.fn(async () => 'copied');
  const executeSsh = vi.fn(async () => '[windows-dev-action] multi-device-sync-c '
    + 'identity=run-1 manifest=D:\\C\\foliole\\.tmp\\artifacts\\'
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
    + 'identity=run-2 manifest=D:\\C\\foliole\\.tmp\\artifacts\\'
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
    + 'identity=run-3 manifest=D:\\C\\foliole\\.tmp\\artifacts\\'
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

it('copies only the fixed participation receipt', async () => {
  const receipt = '[windows-dev-action] multi-device-sync-participation '
    + 'identity=run-4 manifest=D:\\C\\foliole\\.tmp\\artifacts\\'
    + 'windows-dev-action\\run-4\\multi-device-sync-participation-receipt.json\n';
  const result = await runWindowsMultiDeviceSyncControl({ action: 'multi-device-sync-participation',
    buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, remote, local) => [remote, local], buildSshSpec: () => ['ssh'],
    env: {}, executeGit: vi.fn(async () => ''), executeScp: vi.fn(async () => 'copied'),
    executeSsh: vi.fn(async () => receipt), fsApi: { mkdirSync: vi.fn() },
    host: 'user@host', repoRoot: '/repo', stdout: { write: vi.fn() } });
  expect(result.manifestPath).toBe(path.join('/repo', '.tmp', 'artifacts',
    'multi-device-sync', 'windows-c', 'run-4', 'multi-device-sync-participation-receipt.json'));
});

it('streams progress and copies only the fixed sync-from-zero receipt', async () => {
  const progress = '[windows-dev-action] progress action=multi-device-sync-from-zero '
    + 'nonce=12345678-1234-1234-1234-123456789abc milestone=c-first-cursor-committed '
    + 'fact=sync-from-zero\n';
  const receipt = '[windows-dev-action] multi-device-sync-from-zero '
    + 'identity=run-5 manifest=D:\\C\\foliole\\.tmp\\artifacts\\'
    + 'windows-dev-action\\run-5\\multi-device-sync-from-zero-receipt.json\n';
  const stdout = { write: vi.fn() };
  const result = await runWindowsMultiDeviceSyncControl({ action: 'multi-device-sync-from-zero',
    buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, remote, local) => [remote, local], buildSshSpec: () => ['ssh'],
    env: {}, executeGit: vi.fn(async () => ''), executeScp: vi.fn(async () => 'copied'),
    executeSsh: vi.fn(async (_args, options) => {
      options.onOutput(progress); options.onOutput(receipt); return `${progress}${receipt}`;
    }), fsApi: { mkdirSync: vi.fn() }, host: 'user@host', repoRoot: '/repo', stdout });
  expect(result.manifestPath).toBe(path.join('/repo', '.tmp', 'artifacts',
    'multi-device-sync', 'windows-c', 'run-5', 'multi-device-sync-from-zero-receipt.json'));
  expect(stdout.write.mock.calls.map(([value]) => value).join('')).toBe(`${progress}${receipt}`);
});

it('copies the route controller selfcheck receipt, logs, and terminal diagnostics', async () => {
  const executeScp = vi.fn(async () => 'copied');
  const receipt = '[windows-dev-action] desktop-dnssd-route-selfcheck '
    + 'identity=run-6 manifest=D:\\C\\foliole\\.tmp\\artifacts\\windows-dev-action\\run-6\\'
    + 'desktop-dnssd-route-controller-selfcheck-receipt.json\n';
  const result = await runWindowsMultiDeviceSyncControl({ action: 'desktop-dnssd-route-selfcheck',
    buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, remote, local) => [remote, local], buildSshSpec: () => ['ssh'],
    env: {}, executeGit: vi.fn(async () => ''), executeScp,
    executeSsh: vi.fn(async () => receipt), fsApi: { mkdirSync: vi.fn() },
    host: 'user@host', repoRoot: '/repo', stdout: { write: vi.fn() } });
  expect(result.manifestPath).toContain('desktop-dnssd-route-selfcheck-receipt.json');
  expect(executeScp.mock.calls.map(([args]) => args[0])).toEqual([
    expect.stringContaining('desktop-dnssd-route-controller-selfcheck-receipt.json'),
    expect.stringContaining('selfcheck-negative-error.json'),
    expect.stringContaining('selfcheck-product-launch.json'),
    expect.stringContaining('desktop-dnssd-route-runtime/action.log'),
    expect.stringContaining('desktop-dnssd-route-runtime/receipt.json')
  ]);
});

it('copies fixed route selfcheck failure diagnostics before preserving the remote error', async () => {
  const executeScp = vi.fn(async () => 'copied');
  const remoteRoot = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-7';
  const output = `[windows-dev-action] status: FAILED exit=74 evidence=${remoteRoot}/summary.json\n`;
  const remoteError = Object.assign(new Error('remote failed'), { output });
  await expect(runWindowsMultiDeviceSyncControl({ action: 'desktop-dnssd-route-selfcheck',
    buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, remote, local) => [remote, local], buildSshSpec: () => ['ssh'],
    env: {}, executeGit: vi.fn(async () => ''), executeScp,
    executeSsh: vi.fn(async () => { throw remoteError; }), fsApi: { mkdirSync: vi.fn() },
    host: 'user@host', repoRoot: '/repo', stdout: { write: vi.fn() }
  })).rejects.toBe(remoteError);
  expect(remoteError.evidenceRoot).toBe(path.join('/repo', '.tmp', 'artifacts',
    'multi-device-sync', 'windows-c', 'run-7'));
  expect(executeScp.mock.calls.map(([args]) => args[0])).toEqual([
    `${remoteRoot}/summary.json`,
    `${remoteRoot}/desktop-dnssd-route-runtime/action.log`,
    `${remoteRoot}/desktop-dnssd-route-runtime/receipt.json`,
    'D:/C/foliole/.tmp/windows-sync-group-interactive/request.json',
    'D:/C/foliole/.tmp/windows-sync-group-interactive/status.json',
    'D:/C/foliole/.tmp/windows-sync-group-interactive/result.json'
  ]);
});

it('copies route provider runtime and nonce terminals before preserving the remote error', async () => {
  const executeScp = vi.fn(async () => 'copied');
  const remoteRoot = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-8';
  const output = `[windows-dev-action] status: FAILED exit=125 evidence=${remoteRoot}/summary.json\n`;
  const remoteError = Object.assign(new Error('provider failed'), { output });
  await expect(runWindowsMultiDeviceSyncControl({ action: 'desktop-dnssd-route-provider',
    buildPushSpec: () => ({ args: ['push'], env: {} }),
    buildScpSpec: (_host, remote, local) => [remote, local], buildSshSpec: () => ['ssh'],
    env: {}, executeGit: vi.fn(async () => ''), executeScp,
    executeSsh: vi.fn(async () => { throw remoteError; }), fsApi: { mkdirSync: vi.fn() },
    host: 'user@host', repoRoot: '/repo', stdout: { write: vi.fn() }
  })).rejects.toBe(remoteError);
  expect(executeScp.mock.calls.map(([args]) => args[0])).toEqual([
    `${remoteRoot}/summary.json`,
    `${remoteRoot}/desktop-dnssd-route-runtime/action.log`,
    `${remoteRoot}/desktop-dnssd-route-runtime/receipt.json`,
    'D:/C/foliole/.tmp/windows-sync-group-interactive/request.json',
    'D:/C/foliole/.tmp/windows-sync-group-interactive/status.json',
    'D:/C/foliole/.tmp/windows-sync-group-interactive/result.json'
  ]);
});
