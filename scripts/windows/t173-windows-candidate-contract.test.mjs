import path from 'node:path';

import { expect, it } from 'vitest';

import {
  assertT173RuntimeIdentity, measureT173RuntimeIdentity, t173PreparedBuildPaths,
  T173_WINDOWS_ACTIONS, T173_WINDOWS_REPO_ROOT
} from './t173-windows-candidate-contract.mjs';

const expected = { branch: 'dev', clean: true, committed: true,
  revision: 'a'.repeat(40), sourceRef: 'refs/heads/dev',
  sourceRoot: T173_WINDOWS_REPO_ROOT, treeDigest: 'b'.repeat(40) };

it('registers every formal Windows stage under the sync candidate owner', () => {
  expect([...T173_WINDOWS_ACTIONS]).toEqual([
    'multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
    'multi-device-sync-from-zero', 'multi-device-sync-participation',
    'two-device-sync-provider'
  ]);
});

it('binds prepared evidence to the compiled Electron entry', () => {
  expect(t173PreparedBuildPaths(T173_WINDOWS_REPO_ROOT)).toEqual({
    electron: path.join(T173_WINDOWS_REPO_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    main: path.join(T173_WINDOWS_REPO_ROOT, 'dist', 'electron', 'main.js')
  });
});

it('measures the actual task-owned source root instead of trusting request fields', () => {
  const values = [`${'a'.repeat(40)}\n`, `${'b'.repeat(40)}\n`, 'dev\n', ''];
  const exec = (_git, args, options) => {
    expect(options.cwd).toBe(T173_WINDOWS_REPO_ROOT);
    expect(args.slice(0, 2)).toEqual(['-c', 'safe.directory=D:/C/foliole']);
    return values.shift();
  };
  expect(measureT173RuntimeIdentity({ exec, gitPath: 'git.exe' })).toEqual(expected);
});

it('rejects an actual runtime tree that differs from the candidate before acceptance', () => {
  expect(() => assertT173RuntimeIdentity(expected, {
    ...expected, treeDigest: 'c'.repeat(40)
  })).toThrow('runtime treeDigest mismatch');
});
