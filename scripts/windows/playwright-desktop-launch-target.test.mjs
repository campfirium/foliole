// @vitest-environment node

import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  createDesktopLaunchOptions,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget,
  resolveElectronExecutablePath
} from './playwright-desktop-launch-target.mjs';

describe('playwright desktop launch target', () => {
  it('prefers configured app root over mirror detection', () => {
    expect(resolveDesktopAppRoot({ FOLIOLE_ELECTRON_APP_ROOT: '/tmp/custom-root' })).toBe(path.resolve('/tmp/custom-root'));
  });

  it('defaults to the current repository root on Linux/WSL', () => {
    expect(resolveDesktopAppRoot({})).toBe(process.platform === 'win32' ? 'D:\\C\\foliole' : path.resolve('.'));
  });

  it('resolves current build output paths in args launch mode', () => {
    const appRoot = path.resolve('/workspace/foliole');
    expect(resolveDesktopLaunchTarget('/workspace/foliole', () => true)).toEqual({
      appRoot,
      launchMode: 'args',
      mainEntry: path.join(appRoot, 'electron-dist', 'electron', 'main.js'),
      missingPaths: [],
      preloadPath: path.join(appRoot, 'electron', 'preload.cjs'),
      rendererIndexPath: path.join(appRoot, 'dist', 'index.html')
    });
  });

  it('resolves installed app launch targets without source build outputs', () => {
    const installedExe = 'C:\\Users\\me\\AppData\\Local\\Programs\\Foliole\\Foliole.exe';

    expect(resolveDesktopLaunchTarget('D:\\C\\foliole', (filePath) => filePath === installedExe, {
      FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: installedExe
    })).toEqual({
      appRoot: 'C:\\Users\\me\\AppData\\Local\\Programs\\Foliole',
      executablePath: installedExe,
      launchMode: 'installed',
      mainEntry: null,
      missingPaths: [],
      preloadPath: null,
      rendererIndexPath: null
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

  it('infers the Electron executable that matches the current host platform', () => {
    const resolved = resolveElectronExecutablePath('D:\\C\\foliole', {}, (filePath) =>
      filePath === 'D:\\C\\foliole\\node_modules\\electron\\dist\\electron.exe'
    );
    expect(resolved).toBe(process.platform === 'win32'
      ? 'D:\\C\\foliole\\node_modules\\electron\\dist\\electron.exe'
      : undefined);
  });

  it('requires the current preload entry instead of historical electron-dist fallback paths', () => {
    const appRoot = path.resolve('/workspace/foliole');
    const target = resolveDesktopLaunchTarget('/workspace/foliole', (filePath) =>
      [
        path.join(appRoot, 'electron-dist', 'electron', 'main.js'),
        path.join(appRoot, 'electron-dist', 'preload.cjs'),
        path.join(appRoot, 'dist', 'index.html')
      ].includes(filePath)
    );

    expect(target.missingPaths).toEqual([path.join(appRoot, 'electron', 'preload.cjs')]);
  });

  it('creates args-based launch options with optional executable override', () => {
    const appRoot = path.resolve('/workspace/foliole');
    const target = resolveDesktopLaunchTarget('/workspace/foliole', () => true);
    const stateRoot = path.resolve('/tmp/foliole-playwright-state');
    const isolationEnv = {
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot,
      FOLIOLE_LIBRARY_HOME: path.join(stateRoot, 'library'),
      FOLIOLE_SESSION_DATA_PATH: path.join(stateRoot, 'session-data'),
      FOLIOLE_USER_DATA_PATH: path.join(stateRoot, 'user-data'),
      FOLIOLE_WORKDIR: stateRoot
    };

    expect(
      createDesktopLaunchOptions(target, 12_345, {
        ELECTRON_RUN_AS_NODE: '1',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }, undefined, (filePath) => filePath === path.join(appRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron'))
    ).toEqual({
      args: [path.join(appRoot, 'electron-dist', 'electron', 'main.js')],
      cwd: appRoot,
      env: { ...isolationEnv, FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1' },
      executablePath: path.join(appRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron'),
      timeout: 12_345
    });

    expect(
      createDesktopLaunchOptions(target, 12_345, {
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }, undefined, (filePath) => filePath === path.join(appRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron'), ['/tmp/opened.md'])
    ).toMatchObject({
      args: [path.join(appRoot, 'electron-dist', 'electron', 'main.js'), '/tmp/opened.md']
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
      executablePath: expect.stringMatching(/Electron[\\/]electron\.exe$/),
      timeout: 9_999
    });
  });

  it('creates installed app launch options without injecting the source main entry', () => {
    const installedExe = 'C:\\Users\\me\\AppData\\Local\\Programs\\Foliole\\Foliole.exe';
    const target = resolveDesktopLaunchTarget('D:\\C\\foliole', () => true, {
      FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: installedExe
    });
    const stateRoot = path.resolve('/tmp/foliole-installed-smoke');

    expect(
      createDesktopLaunchOptions(target, 12_345, {
        ELECTRON_RUN_AS_NODE: '1',
        FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: installedExe,
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      })
    ).toMatchObject({
      args: [],
      cwd: 'C:\\Users\\me\\AppData\\Local\\Programs\\Foliole',
      executablePath: installedExe,
      timeout: 12_345
    });
  });

  it('passes debug Chromium switches before the Electron app entry when requested', () => {
    const appRoot = path.resolve('/workspace/foliole');
    const target = resolveDesktopLaunchTarget('/workspace/foliole', () => true);
    const stateRoot = path.resolve('/tmp/foliole-playwright-state');

    expect(
      createDesktopLaunchOptions(target, 12_345, {
        FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG: '1',
        FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }, undefined, () => false)
    ).toMatchObject({
      args: [
        '--disable-gpu',
        '--disable-gpu-compositing',
        '--disable-gpu-sandbox',
        '--no-sandbox',
        path.join(appRoot, 'electron-dist', 'electron', 'main.js')
      ]
    });
  });

  it('infers the electron executable from the app root when no override is provided', () => {
    const appRoot = path.resolve('/workspace/foliole');
    const electronName = process.platform === 'win32' ? 'electron.exe' : 'electron';
    const expectedExecutable = path.join(appRoot, 'node_modules', 'electron', 'dist', electronName);
    expect(
      resolveElectronExecutablePath('/mnt/d/C/foliole', {}, (filePath) =>
        filePath === '/mnt/d/C/foliole/node_modules/electron/dist/electron.exe'
      )
    ).toBeUndefined();

    expect(
      resolveElectronExecutablePath('/workspace/foliole', {}, (filePath) =>
        filePath === expectedExecutable
      )
    ).toBe(expectedExecutable);
  });
});
