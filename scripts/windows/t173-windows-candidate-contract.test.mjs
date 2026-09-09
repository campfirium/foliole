import path from 'node:path';

import { expect, it } from 'vitest';

import {
  assertT173RuntimeIdentity, measureT173RuntimeIdentity, t173PreparedBuildPaths,
  T173_WINDOWS_REPO_ROOT
} from './t173-windows-candidate-contract.mjs';

const expected = { branch: 'sync', clean: true, committed: true,
  revision: 'a'.repeat(40), sourceRef: 'refs/heads/sync',
  sourceRoot: T173_WINDOWS_REPO_ROOT, treeDigest: 'b'.repeat(40) };

it('binds prepared evidence to the compiled Electron entry', () => {
  expect(t173PreparedBuildPaths(T173_WINDOWS_REPO_ROOT)).toEqual({
    electron: path.join(T173_WINDOWS_REPO_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    main: path.join(T173_WINDOWS_REPO_ROOT, 'dist', 'electron', 'main.js')
  });
});

it('measures the actual task-owned source root instead of trusting request fields', () => {
  const values = [`${'a'.repeat(40)}\n`, `${'b'.repeat(40)}\n`, 'sync\n', ''];
  const exec = (_git, args, options) => {
    expect(options.cwd).toBe(T173_WINDOWS_REPO_ROOT);
    expect(args.slice(0, 2)).toEqual(['-c', 'safe.directory=D:/C/foliole-sync']);
    return values.shift();
  };
  expect(measureT173RuntimeIdentity({ exec, gitPath: 'git.exe' })).toEqual(expected);
});

it('rejects an actual runtime tree that differs from the candidate before acceptance', () => {
  expect(() => assertT173RuntimeIdentity(expected, {
    ...expected, treeDigest: 'c'.repeat(40)
  })).toThrow('runtime treeDigest mismatch');
});
