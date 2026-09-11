import { expect, it, vi } from 'vitest';

import { openWindowsSyncClient } from './open-windows-sync-client.mjs';

it('pushes, aligns, replaces, and opens the committed sync client', async () => {
  const calls = [];
  const run = vi.fn(async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'branch') return 'sync\n';
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`;
    return '';
  });
  const launch = vi.fn(() => 42);
  const fetchApi = vi.fn(async () => ({ ok: true,
    json: async () => ({ Browser: 'Foliole fixture' }) }));
  const portOpen = vi.fn(async () => true);
  const result = await openWindowsSyncClient({ repoRoot: '/repo', run, launch, fetchApi, portOpen });
  expect(calls.find((call) => call.includes('push'))).toContain('sync:refs/heads/sync');
  expect(calls.find((call) => call.includes('align'))).toContain('a'.repeat(40));
  expect(calls.find((call) => call.includes('stop'))).toContain('9222');
  expect(calls.findIndex((call) => call.includes('stop')))
    .toBeLessThan(calls.findIndex((call) => call.includes('align')));
  expect(launch.mock.calls[0][1]).toContain('start');
  expect(result).toMatchObject({ browser: 'Foliole fixture', pid: 42,
    revision: 'a'.repeat(40) });
});

it('starts the fixed CDP tunnel when it is absent', async () => {
  const outputs = ['sync\n', '', `${'a'.repeat(40)}\n`];
  const run = vi.fn(async () => outputs.shift() ?? '');
  const launch = vi.fn(() => 42);
  const states = [false, false, true];
  const portOpen = vi.fn(async () => states.shift() ?? true);
  const fetchApi = vi.fn(async () => ({ ok: true, json: async () => ({ Browser: 'fixture' }) }));
  await openWindowsSyncClient({ repoRoot: '/repo', run, launch, fetchApi, portOpen });
  expect(launch.mock.calls[0][0]).toBe('ssh');
  expect(launch.mock.calls[0][1]).toContain('127.0.0.1:19222:127.0.0.1:9222');
});

it('rejects an uncommitted sync worktree', async () => {
  const outputs = ['sync\n', ' M src/app.ts\n', `${'a'.repeat(40)}\n`];
  const run = vi.fn(async () => outputs.shift());
  await expect(openWindowsSyncClient({ repoRoot: '/repo', run }))
    .rejects.toThrow('must be committed');
});
