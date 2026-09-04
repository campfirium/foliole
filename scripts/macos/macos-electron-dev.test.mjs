// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { resolveMacosElectronDevAction } from './macos-electron-dev.mjs';
import {
  createMacosDailyEnvironment,
  resolveMacosElectronDevLibraryHome
} from './macos-electron-dev-environment.mjs';
import {
  MACOS_DAILY_DEBUG_ROOT,
  MACOS_DAILY_LIBRARY_HOME,
  MACOS_RESET_PREVIEW_ROOT,
  resolveMacosElectronDevPaths,
  resolveMacosElectronWatchTargets
} from './macos-electron-dev-paths.mjs';

describe('macOS Electron dev entry', () => {
  it('uses separate persistent and reset-preview roots', () => {
    const repoRoot = path.resolve(path.parse(process.cwd()).root, 'repo', 'foliole');
    const paths = resolveMacosElectronDevPaths(repoRoot);
    expect(paths.dailyRoot).toBe(path.join(repoRoot, MACOS_DAILY_DEBUG_ROOT));
    expect(paths.resetPreviewRoot).toBe(path.join(repoRoot, MACOS_RESET_PREVIEW_ROOT));
    expect(paths.dailyRoot).not.toBe(paths.resetPreviewRoot);
    expect(MACOS_DAILY_LIBRARY_HOME).toBe('/Users/roamer/Documents/Foliole');
  });

  it('accepts the complete explicit control surface', () => {
    for (const action of ['start', 'status', 'stop', 'restart', 'full-restart', 'logs', 'reset', 'reset-preview']) {
      expect(resolveMacosElectronDevAction(['node', 'entry', action])).toBe(action);
    }
    expect(() => resolveMacosElectronDevAction(['node', 'entry', 'publish'])).toThrow('unsupported');
  });

  it('maintains repository-local storage before starting daily production', () => {
    const source = fs.readFileSync('scripts/macos/macos-electron-dev-supervisor.mjs', 'utf8');
    expect(source).toContain('maintainBeforeProduction)({ rootDir: paths.appRoot })');
  });

  it('resolves a persistent explicit Demo library without changing the isolated runtime root', () => {
    const paths = resolveMacosElectronDevPaths('/repo/foliole');
    const libraryHome = resolveMacosElectronDevLibraryHome([
      '--library-home', '/Users/tester/Documents/FolioleDemo'
    ], paths.appRoot);
    const environment = createMacosDailyEnvironment({
      env: {},
      homeDir: '/Users/tester',
      libraryHome,
      paths,
      platform: 'darwin'
    });

    expect(libraryHome).toBe(path.resolve('/Users/tester/Documents/FolioleDemo'));
    expect(environment).toMatchObject({
      FOLIOLE_LIBRARY_HOME: libraryHome,
      FOLIOLE_PREVIEW_SANDBOX_RESET: '0',
      FOLIOLE_PREVIEW_SANDBOX_ROOT: paths.dailyRoot,
      FOLIOLE_USER_DATA_PATH: path.join(paths.dailyRoot, 'user-data')
    });
  });

  it('rejects an empty explicit library home', () => {
    expect(() => resolveMacosElectronDevLibraryHome(['--library-home'], '/repo/foliole'))
      .toThrow('--library-home requires a path');
  });

  it('watches main, IPC, and preload compile inputs', () => {
    const paths = resolveMacosElectronDevPaths('/repo/foliole');
    const [electronTarget] = resolveMacosElectronWatchTargets(paths);

    expect(electronTarget.matches('ipc/menu.ts')).toBe(true);
    expect(electronTarget.matches('preload.cjs')).toBe(true);
    expect(electronTarget.matches('README.md')).toBe(false);
  });
});
