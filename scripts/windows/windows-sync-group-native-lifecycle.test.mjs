// @vitest-environment node

import { expect, it } from 'vitest';

import {
  restoreWindowsNativeClient, suspendWindowsNativeClient
} from './windows-sync-group-native-lifecycle.mjs';

it('leaves an already stopped native client stopped around isolated device work', async () => {
  const actions = [];
  const options = { control: async (_execute, _paths, action) => actions.push(action),
    execute: async () => undefined, isRunning: () => false, paths: { repoRoot: '/repo' } };
  const suspended = await suspendWindowsNativeClient(options);
  await restoreWindowsNativeClient({ ...options, suspended });
  expect(suspended).toBe(false);
  expect(actions).toEqual([]);
});

it('proves the interactive restore path before stopping a running native client', async () => {
  const actions = [];
  const options = { control: async (_execute, _paths, action) => actions.push(action),
    execute: async () => undefined, isRunning: () => true, paths: { repoRoot: '/repo' } };
  const suspended = await suspendWindowsNativeClient(options);
  await restoreWindowsNativeClient({ ...options, suspended });
  expect(suspended).toBe(true);
  expect(actions).toEqual(['status', 'stop', 'start']);
});

it('does not stop a running client when the interactive restore preflight fails', async () => {
  const actions = [];
  const options = { control: async (_execute, _paths, action) => {
    actions.push(action);
    if (action === 'status') throw new Error('interactive unavailable');
  }, execute: async () => undefined, isRunning: () => true, paths: { repoRoot: '/repo' } };
  await expect(suspendWindowsNativeClient(options)).rejects.toThrow('interactive unavailable');
  expect(actions).toEqual(['status']);
});
