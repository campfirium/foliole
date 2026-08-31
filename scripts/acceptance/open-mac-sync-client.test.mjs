import { expect, it, vi } from 'vitest';

import { openMacSyncClient } from './open-mac-sync-client.mjs';

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
  const fetchApi = vi.fn(async () => ({ ok: true,
    json: async () => ({ Browser: 'Foliole fixture' }) }));
  const result = await openMacSyncClient({ repoRoot: '/repo', run, stop, launch, fetchApi });
  expect(calls).toContainEqual(['npm', 'run', 'build']);
  expect(calls).toContainEqual(['npm', 'run', 'electron:compile']);
  expect(stop).toHaveBeenCalledWith({ endpoint: 'http://127.0.0.1:19224', fetchApi,
    repoRoot: '/repo' });
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
