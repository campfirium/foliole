// @vitest-environment node
/* global process */

import path from 'node:path';

import { expect, it } from 'vitest';

import {
  buildPowerShellArgs,
  resolveWindowsClientAction,
  resolveWindowsWorkdir
} from './windows-client-native.mjs';

it('defaults native Windows client actions to status', () => {
  expect(resolveWindowsClientAction(['node', 'script'])).toBe('status');
  expect(resolveWindowsClientAction(['node', 'script', 'restart'])).toBe('restart');
});

it('rejects unsupported native Windows client actions before spawning PowerShell', () => {
  expect(() => resolveWindowsClientAction(['node', 'script', 'sync'])).toThrow(
    'unsupported Windows client action: sync'
  );
});

it('defaults the native Windows client workdir to the current checkout', () => {
  expect(resolveWindowsWorkdir({})).toBe(path.resolve(process.cwd()));
  expect(resolveWindowsWorkdir({ FOLIOLE_WINDOWS_WORKDIR: 'D:\\C\\foliole' })).toBe('D:\\C\\foliole');
  expect(resolveWindowsWorkdir({ WINDOWS_WORKDIR: 'C:\\dev\\foliole' })).toBe('C:\\dev\\foliole');
});

it('builds a direct PowerShell file invocation without inline command strings', () => {
  const args = buildPowerShellArgs({
    action: 'status',
    runtimeHead: 'abc123',
    windowsWorkdir: 'D:\\C\\foliole'
  });

  expect(args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive', '-File']));
  expect(args).toEqual(expect.arrayContaining(['-Action', 'status']));
  expect(args).toEqual(expect.arrayContaining(['-WindowsWorkDir', 'D:\\C\\foliole']));
  expect(args).toEqual(expect.arrayContaining(['-RuntimeHead', 'abc123']));
  expect(args).not.toContain('-Command');
});
