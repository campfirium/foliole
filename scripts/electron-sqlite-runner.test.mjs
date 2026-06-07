// @vitest-environment node
/* global process */

import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buildElectronNodeArgs,
  buildElectronNodeEnv,
  buildElectronNodeSpawnOptions,
  buildRunnerInvocation,
  resolveElectronBinary
} from './electron-sqlite-runner.mjs';

describe('electron sqlite runner', () => {
  it('resolves the bundled Electron binary for the current platform', () => {
    const binary = resolveElectronBinary('D:/C/foliole');
    const expectedName = process.platform === 'win32' ? 'electron.exe' : 'electron';

    expect(binary).toBe(path.join('D:/C/foliole', 'node_modules', 'electron', 'dist', expectedName));
  });

  it('runs TypeScript scripts through Electron-as-Node with strip-types enabled', () => {
    expect(buildElectronNodeArgs('scripts/sqlite-maintenance.ts', ['backup'])).toEqual([
      '--experimental-strip-types',
      'scripts/sqlite-maintenance.ts',
      'backup'
    ]);
  });

  it('forces ELECTRON_RUN_AS_NODE without dropping the caller environment', () => {
    expect(buildElectronNodeEnv({ FOO: 'bar' })).toEqual({
      ELECTRON_RUN_AS_NODE: '1',
      FOO: 'bar'
    });
  });

  it('can describe a dry-run invocation without touching sqlite', () => {
    expect(buildRunnerInvocation('scripts/android/android-sync-audit.mjs', ['--desktop-db', 'a.db'], 'D:/C/foliole')).toEqual({
      args: ['scripts/android/android-sync-audit.mjs', '--desktop-db', 'a.db'],
      cwd: 'D:/C/foliole',
      electronPath: path.join('D:/C/foliole', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron'),
      env: { ELECTRON_RUN_AS_NODE: '1' }
    });
  });

  it('inherits child output for normal script runs so large test logs do not fill a sync buffer', () => {
    expect(buildElectronNodeSpawnOptions('D:/C/foliole')).toEqual({
      cwd: 'D:/C/foliole',
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
      stdio: 'inherit'
    });
  });

  it('keeps captured text available for sqlite preflight diagnostics', () => {
    expect(buildElectronNodeSpawnOptions('D:/C/foliole', ['ignore', 'pipe', 'pipe'])).toEqual({
      cwd: 'D:/C/foliole',
      encoding: 'utf8',
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
  });

  it('preflights by instantiating the native sqlite binding', async () => {
    const source = await readFile(path.resolve('scripts/electron-sqlite-runner.mjs'), 'utf8');

    expect(source).toContain("--preflight");
    expect(source).toContain("new Database(':memory:')");
    expect(source).toContain("db.prepare('SELECT 1').get();");
  });
});
