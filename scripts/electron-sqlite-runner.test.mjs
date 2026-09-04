// @vitest-environment node
/* global process */

import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ensureElectronBinary } from './electron-runtime-binary.mjs';

import {
  buildElectronNodeArgs,
  buildElectronNodeEnv,
  buildElectronNodeSpawnOptions,
  buildRunnerInvocation,
  resolveElectronBinary,
  resolveElectronSqliteTempRoot
} from './electron-sqlite-runner.mjs';

describe('electron sqlite runner', () => {
  it('resolves the bundled Electron binary for the current platform', () => {
    const binary = resolveElectronBinary('D:/C/foliole');
    const expectedTail = process.platform === 'darwin'
      ? ['Electron.app', 'Contents', 'MacOS', 'Electron']
      : [process.platform === 'win32' ? 'electron.exe' : 'electron'];

    expect(binary).toBe(path.join('D:/C/foliole', 'node_modules', 'electron', 'dist', ...expectedTail));
  });

  it('uses the Electron package entry to provision the executable before real runs', () => {
    const loadElectron = (specifier) => {
      expect(specifier).toBe('electron');
      return '/prepared/electron';
    };

    expect(ensureElectronBinary('D:/C/foliole', loadElectron)).toBe('/prepared/electron');
  });

  it('runs TypeScript scripts through Electron-as-Node with source extension resolution', () => {
    expect(buildElectronNodeArgs('scripts/sqlite/sqlite-maintenance.ts', ['backup'])).toEqual([
      '--experimental-loader',
      './scripts/android/ts-js-extension-loader.mjs',
      '--experimental-strip-types',
      'scripts/sqlite/sqlite-maintenance.ts',
      'backup'
    ]);
  });

  it('forces ELECTRON_RUN_AS_NODE without dropping the caller environment', () => {
    expect(buildElectronNodeEnv({ FOO: 'bar' }, 'D:/C/foliole')).toEqual({
      ELECTRON_RUN_AS_NODE: '1',
      FOO: 'bar'
    });
  });

  it('pins sqlite test temp files under the repo-local temp root', () => {
    expect(resolveElectronSqliteTempRoot('D:/C/foliole')).toBe(path.join('D:/C/foliole', '.tmp', 'electron-sqlite-tmp'));
  });

  it('can describe a dry-run invocation without touching sqlite', () => {
    expect(buildRunnerInvocation('scripts/android/android-sync-audit.mjs', ['--desktop-db', 'a.db'], 'D:/C/foliole')).toEqual({
      args: ['scripts/android/android-sync-audit.mjs', '--desktop-db', 'a.db'],
      cwd: 'D:/C/foliole',
      electronPath: resolveElectronBinary('D:/C/foliole'),
      env: { ELECTRON_RUN_AS_NODE: '1' }
    });
  });

  it('uses repo-local temp files for sqlite vitest runs only', () => {
    const expectedEnv = {
      ELECTRON_RUN_AS_NODE: '1',
      TEMP: path.join('D:/C/foliole', '.tmp', 'electron-sqlite-tmp'),
      TMP: path.join('D:/C/foliole', '.tmp', 'electron-sqlite-tmp'),
      TMPDIR: path.join('D:/C/foliole', '.tmp', 'electron-sqlite-tmp')
    };
    expect(buildRunnerInvocation(
      'scripts/test-files.mjs', ['electron/mirror/example.test.ts'], 'D:/C/foliole'
    ).env).toEqual(expectedEnv);
    expect(buildRunnerInvocation(
      'scripts/run-vitest-with-summary.mjs',
      ['report.json', '--', 'electron\\import\\example.test.ts'],
      'D:/C/foliole'
    ).env).toEqual(expectedEnv);
    expect(buildRunnerInvocation(
      'scripts/run-vitest-with-summary.mjs', ['report.json', '--', 'src/app/example.test.ts'], 'D:/C/foliole'
    ).env).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
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
