// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  resolveMacosElectronDevAction,
  resolveMacosElectronDevOpenMode
} from './macos-electron-dev.mjs';
import {
  createMacosDailyEnvironment,
  resolveMacosElectronDevLibraryHome
} from './macos-electron-dev-environment.mjs';
import {
  MACOS_DAILY_DEBUG_ROOT,
  MACOS_DAILY_LIBRARY_HOME,
  MACOS_DEV_LIBRARY_HOME,
  MACOS_DEV_SYNC_PORT,
  MACOS_RESET_PREVIEW_ROOT,
  resolveMacosElectronDevPaths
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
    for (const action of [
      'start', 'status', 'stop', 'restart', 'full-restart', 'logs', 'open', 'reset', 'reset-preview'
    ]) {
      expect(resolveMacosElectronDevAction(['node', 'entry', action])).toBe(action);
    }
    expect(() => resolveMacosElectronDevAction(['node', 'entry', 'publish'])).toThrow('unsupported');
  });

  it('opens through the existing runtime lifecycle instead of creating a second protocol', () => {
    expect(resolveMacosElectronDevOpenMode({ running: true, supervisorAlive: true })).toBe('restart');
    expect(resolveMacosElectronDevOpenMode({ running: false, supervisorAlive: true })).toBe('recover');
    expect(resolveMacosElectronDevOpenMode({ running: false, supervisorAlive: false })).toBe('start');
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

  it('opens its own development library by default instead of the daily library', () => {
    const libraryHome = resolveMacosElectronDevLibraryHome([], '/repo/foliole');
    expect(libraryHome).toBe(MACOS_DEV_LIBRARY_HOME);
    expect(libraryHome).not.toBe(MACOS_DAILY_LIBRARY_HOME);
  });

  it('refuses to open the daily library that the installed app uses', () => {
    for (const value of [MACOS_DAILY_LIBRARY_HOME, `${MACOS_DAILY_LIBRARY_HOME}/`]) {
      expect(() => resolveMacosElectronDevLibraryHome(['--library-home', value], '/repo/foliole'))
        .toThrow('daily library');
    }
  });

  it('serves sync on its own port so the daily app keeps 38641', () => {
    const paths = resolveMacosElectronDevPaths('/repo/foliole');
    const base = { homeDir: '/Users/tester', libraryHome: MACOS_DEV_LIBRARY_HOME, paths, platform: 'darwin' };
    expect(createMacosDailyEnvironment({ ...base, env: {} }).FOLIOLE_COMPANION_SYNC_PORT)
      .toBe(MACOS_DEV_SYNC_PORT);
    expect(MACOS_DEV_SYNC_PORT).toMatch(/^\d+$/u);
    expect(MACOS_DEV_SYNC_PORT).not.toBe('38641');
  });

  it('rejects an empty explicit library home', () => {
    expect(() => resolveMacosElectronDevLibraryHome(['--library-home'], '/repo/foliole'))
      .toThrow('--library-home requires a path');
  });

  it('keeps daily DEV runtime changes behind explicit controls', () => {
    const source = fs.readFileSync('scripts/macos/macos-electron-dev-supervisor.mjs', 'utf8');
    expect(source).not.toContain('createElectronRuntimeWatcher');
    expect(source).not.toContain('Electron compile inputs changed');
  });
});
