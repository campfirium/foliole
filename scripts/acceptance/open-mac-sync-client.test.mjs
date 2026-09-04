import { expect, it, vi } from 'vitest';

import { openMacSyncClient, stopExistingMacClient } from './open-mac-sync-client.mjs';

it('builds, replaces, and opens the committed sync client', async () => {
  const calls = [];
  const run = vi.fn(async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'branch') return 'sync\n';
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`;
    return '';
  });
  const stop = vi.fn(async () => undefined);
  const launch = vi.fn(() => 42);
  const maintain = vi.fn();
  const fetchApi = vi.fn(async () => ({ ok: true,
    json: async () => ({ Browser: 'Foliole fixture' }) }));
  const result = await openMacSyncClient({
    repoRoot: '/repo', run, stop, launch, fetchApi, maintain
  });
  expect(calls).toContainEqual(['npm', 'run', 'build']);
  expect(calls).toContainEqual(['npm', 'run', 'electron:compile']);
  expect(stop).toHaveBeenCalledWith({ repoRoot: '/repo' });
  expect(maintain).toHaveBeenCalledWith({ rootDir: '/repo' });
  expect(launch.mock.calls[0][1]).toContain('a'.repeat(40));
  expect(result).toMatchObject({ browser: 'Foliole fixture', pid: 42,
    revision: 'a'.repeat(40) });
});

it('rejects an uncommitted sync worktree before building', async () => {
  const outputs = ['sync\n', ' M src/app.ts\n', `${'a'.repeat(40)}\n`];
  const run = vi.fn(async () => outputs.shift());
  await expect(openMacSyncClient({ repoRoot: '/repo', run }))
    .rejects.toThrow('must be committed');
  expect(run).not.toHaveBeenCalledWith('npm', expect.anything(), expect.anything());
});

it('stops only the isolated client manager that owns the fixed port', async () => {
  const executable = '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron';
  const run = vi.fn(async (command, args) => {
    if (command === 'lsof') return '42\n';
    if (args.includes('42')) return `41 ${executable} /repo/dist/electron/main.js\n`;
    return 'node scripts/acceptance/launch-isolated-desktop.mjs '
      + '--artifact-root /repo/.tmp/artifacts/client --cdp-port 19224\n';
  });
  const signal = vi.fn();
  const states = [true, true, false, false];
  await stopExistingMacClient({ repoRoot: '/repo', run, signal,
    alive: () => states.shift() ?? false, wait: async () => undefined });
  expect(signal).toHaveBeenCalledWith(41, 'SIGTERM');
});

it('refuses a fixed port owned outside the isolated client chain', async () => {
  const run = vi.fn(async (command, args) => {
    if (command === 'lsof') return '42\n';
    if (args.includes('42')) return '41 /Applications/Other.app/Other\n';
    return 'node unrelated.mjs\n';
  });
  const signal = vi.fn();
  await expect(stopExistingMacClient({ repoRoot: '/repo', run, signal }))
    .rejects.toThrow('not owned by this checkout');
  expect(signal).not.toHaveBeenCalled();
});
