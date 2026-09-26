import { expect, it, vi } from 'vitest';

import { openWindowsSyncClient } from './open-windows-sync-client.mjs';

it('prepares the dev candidate, checks its Windows revision, and opens an isolated client', async () => {
  const calls = [];
  const run = vi.fn(async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'branch') return 'dev\n';
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`;
    if (args.includes('facts')) return JSON.stringify({
      branch: 'dev', clean: true, head: 'a'.repeat(40)
    });
    return '';
  });
  const launch = vi.fn(() => 42);
  const fetchApi = vi.fn(async () => ({ ok: true,
    json: async () => ({ Browser: 'Foliole fixture' }) }));
  const portOpen = vi.fn(async () => true);
  const result = await openWindowsSyncClient({ repoRoot: '/repo', run, launch, fetchApi, portOpen });
  expect(calls.find((call) => call.includes('multi-device-sync-candidate'))).toBeDefined();
  expect(calls.find((call) => call.includes('facts'))).toBeDefined();
  expect(calls.find((call) => call.includes('stop'))).toContain('9222');
  expect(calls.findIndex((call) => call.includes('stop')))
    .toBeLessThan(calls.findIndex((call) => call.includes('multi-device-sync-candidate')));
  expect(launch.mock.calls[0][1]).toContain('start');
  expect(result).toMatchObject({ browser: 'Foliole fixture', pid: 42,
    revision: 'a'.repeat(40) });
});

it('starts the fixed CDP tunnel when it is absent', async () => {
  const outputs = ['dev\n', '', `${'a'.repeat(40)}\n`];
  const run = vi.fn(async (_command, args) => args[0] === 'branch'
    ? outputs.shift() : args[0] === 'status' || args[0] === 'rev-parse'
      ? outputs.shift() : args.includes('facts')
        ? JSON.stringify({ branch: 'dev', clean: true, head: 'a'.repeat(40) }) : '');
  const launch = vi.fn(() => 42);
  const states = [false, false, true];
  const portOpen = vi.fn(async () => states.shift() ?? true);
  const fetchApi = vi.fn(async () => ({ ok: true, json: async () => ({ Browser: 'fixture' }) }));
  await openWindowsSyncClient({ repoRoot: '/repo', run, launch, fetchApi, portOpen });
  expect(launch.mock.calls[0][0]).toBe('ssh');
  expect(launch.mock.calls[0][1]).toContain('127.0.0.1:19222:127.0.0.1:9222');
});

it('rejects an uncommitted dev worktree', async () => {
  const outputs = ['dev\n', ' M src/app.ts\n', `${'a'.repeat(40)}\n`];
  const run = vi.fn(async () => outputs.shift());
  await expect(openWindowsSyncClient({ repoRoot: '/repo', run }))
    .rejects.toThrow('must be committed');
});

it('does not start the client when Windows is on another revision', async () => {
  const run = vi.fn(async (_command, args) => {
    if (args[0] === 'branch') return 'dev\n';
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`;
    if (args.includes('facts')) return JSON.stringify({
      branch: 'dev', clean: true, head: 'b'.repeat(40)
    });
    return '';
  });
  const launch = vi.fn();
  await expect(openWindowsSyncClient({
    repoRoot: '/repo', run, launch, portOpen: async () => true
  })).rejects.toThrow('does not match the Mac candidate');
  expect(launch).not.toHaveBeenCalled();
});
