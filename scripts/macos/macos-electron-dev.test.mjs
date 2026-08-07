// @vitest-environment node

import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { resolveMacosElectronDevAction } from './macos-electron-dev.mjs';
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

  it('watches main, IPC, and preload compile inputs', () => {
    const paths = resolveMacosElectronDevPaths('/repo/foliole');
    const [electronTarget] = resolveMacosElectronWatchTargets(paths);

    expect(electronTarget.matches('ipc/menu.ts')).toBe(true);
    expect(electronTarget.matches('preload.cjs')).toBe(true);
    expect(electronTarget.matches('README.md')).toBe(false);
  });
});
