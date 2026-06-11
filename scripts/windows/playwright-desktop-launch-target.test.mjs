// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createDesktopLaunchOptions,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget,
  resolveElectronExecutablePath
} from './playwright-desktop-launch-target.mjs';

describe('playwright desktop launch target', () => {
  it('prefers configured app root over mirror detection', () => {
    expect(resolveDesktopAppRoot({ FOLIOLE_ELECTRON_APP_ROOT: '/tmp/custom-root' })).toBe('/tmp/custom-root');
  });

  it('defaults to the fixed windows mirror root instead of current working directory', () => {
    expect(resolveDesktopAppRoot({})).toBe('/mnt/d/C/foliole');
  });

  it('derives the mirror root from the configured windows workdir', () => {
    expect(resolveDesktopAppRoot({ FOLIOLE_WINDOWS_WORKDIR: 'D:\\foliole-dev\\sandbox' })).toBe(
      '/mnt/d/foliole-dev/sandbox'
    );
  });

  it('normalizes drive-relative configured windows workdirs before deriving the mirror root', () => {
    expect(resolveDesktopAppRoot({ FOLIOLE_WINDOWS_WORKDIR: 'D:C\\foliole' })).toBe('/mnt/d/C/foliole');
  });

  it('resolves current build output paths in args launch mode', () => {
    expect(resolveDesktopLaunchTarget('/workspace/foliole', () => true)).toEqual({
      appRoot: '/workspace/foliole',
      launchMode: 'args',
      mainEntry: '/workspace/foliole/electron-dist/electron/main.js',
      missingPaths: [],
      preloadPath: '/workspace/foliole/electron/preload.cjs',
      rendererIndexPath: '/workspace/foliole/dist/index.html'
    });
  });

  it('keeps Windows app roots on win32 paths when resolving launch outputs', () => {
    expect(resolveDesktopLaunchTarget('D:\\C\\foliole', () => true)).toEqual({
      appRoot: 'D:\\C\\foliole',
      launchMode: 'args',
      mainEntry: 'D:\\C\\foliole\\electron-dist\\electron\\main.js',
      missingPaths: [],
      preloadPath: 'D:\\C\\foliole\\electron\\preload.cjs',
      rendererIndexPath: 'D:\\C\\foliole\\dist\\index.html'
    });
  });

  it('normalizes drive-relative Windows roots before resolving launch outputs', () => {
    expect(resolveDesktopLaunchTarget('D:C\\foliole', () => true)).toMatchObject({
      appRoot: 'D:\\C\\foliole',
      mainEntry: 'D:\\C\\foliole\\electron-dist\\electron\\main.js'
    });
  });

  it('keeps Windows executable paths absolute without appending them to the current app root', () => {
    expect(resolveElectronExecutablePath('D:\\C\\foliole', {}, (filePath) =>
      filePath === 'D:\\C\\foliole\\node_modules\\electron\\dist\\electron.exe'
    )).toBe('D:\\C\\foliole\\node_modules\\electron\\dist\\electron.exe');
  });

  it('requires the current preload entry instead of historical electron-dist fallback paths', () => {
    const target = resolveDesktopLaunchTarget('/workspace/foliole', (filePath) =>
      [
        '/workspace/foliole/electron-dist/electron/main.js',
        '/workspace/foliole/electron-dist/preload.cjs',
        '/workspace/foliole/dist/index.html'
      ].includes(filePath)
    );

    expect(target.missingPaths).toEqual(['/workspace/foliole/electron/preload.cjs']);
  });

  it('creates args-based launch options with optional executable override', () => {
    const target = resolveDesktopLaunchTarget('/workspace/foliole', () => true);
    const stateRoot = '/tmp/foliole-playwright-state';
    const isolationEnv = {
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot,
      FOLIOLE_SESSION_DATA_PATH: path.join(stateRoot, 'session-data'),
      FOLIOLE_USER_DATA_PATH: path.join(stateRoot, 'user-data'),
      FOLIOLE_WORKDIR: stateRoot
    };

    expect(
      createDesktopLaunchOptions(target, 12_345, {
        ELECTRON_RUN_AS_NODE: '1',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }, undefined, (filePath) => filePath === '/workspace/foliole/node_modules/electron/dist/electron')
    ).toEqual({
      args: ['/workspace/foliole/electron-dist/electron/main.js'],
      cwd: '/workspace/foliole',
      env: { ...isolationEnv, FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1' },
      executablePath: '/workspace/foliole/node_modules/electron/dist/electron',
      timeout: 12_345
    });

    expect(
      createDesktopLaunchOptions(target, 12_345, {
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }, undefined, (filePath) => filePath === '/workspace/foliole/node_modules/electron/dist/electron', ['/tmp/opened.md'])
    ).toMatchObject({
      args: ['/workspace/foliole/electron-dist/electron/main.js', '/tmp/opened.md']
    });

    expect(
      createDesktopLaunchOptions(target, 9_999, {
        FOLIOLE_ELECTRON_EXECUTABLE_PATH: '../Electron/electron.exe',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }, undefined, () => false)
    ).toMatchObject({
      env: {
        ...isolationEnv,
        FOLIOLE_ELECTRON_EXECUTABLE_PATH: '../Electron/electron.exe',
        FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1'
      },
      executablePath: expect.stringMatching(/Electron\/electron\.exe$/),
      timeout: 9_999
    });
  });

  it('infers the electron executable from the app root when no override is provided', () => {
    expect(
      resolveElectronExecutablePath('/mnt/d/C/foliole', {}, (filePath) =>
        filePath === '/mnt/d/C/foliole/node_modules/electron/dist/electron.exe'
      )
    ).toBe('/mnt/d/C/foliole/node_modules/electron/dist/electron.exe');

    expect(
      resolveElectronExecutablePath('/workspace/foliole', {}, (filePath) =>
        filePath === '/workspace/foliole/node_modules/electron/dist/electron'
      )
    ).toBe('/workspace/foliole/node_modules/electron/dist/electron');
  });
});
