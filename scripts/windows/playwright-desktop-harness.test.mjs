// @vitest-environment node

import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  APP_READY_FLAG,
  acquireStableDesktopWindow,
  createDesktopLaunchOptions,
  launchDesktopSession,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget,
  waitForDesktopAppReady
} from './playwright-desktop-harness.mjs';

describe('playwright desktop harness', () => {
  it('prefers configured app root over mirror detection', () => {
    const appRoot = resolveDesktopAppRoot(
      { FOLIOLE_ELECTRON_APP_ROOT: '/tmp/custom-root' },
      () => true
    );

    expect(appRoot).toBe('/tmp/custom-root');
  });

  it('resolves current build output paths in args launch mode', () => {
    const target = resolveDesktopLaunchTarget('/workspace/foliole', () => true);

    expect(target).toEqual({
      appRoot: '/workspace/foliole',
      launchMode: 'args',
      mainEntry: '/workspace/foliole/electron-dist/electron/main.js',
      missingPaths: [],
      preloadPath: '/workspace/foliole/electron/preload.cjs',
      rendererIndexPath: '/workspace/foliole/dist/index.html'
    });
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

    expect(createDesktopLaunchOptions(target, 12_345, {})).toEqual({
      args: ['/workspace/foliole/electron-dist/electron/main.js'],
      cwd: '/workspace/foliole',
      env: {
        FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1'
      },
      executablePath: undefined,
      timeout: 12_345
    });

    expect(
      createDesktopLaunchOptions(target, 9_999, {
        FOLIOLE_ELECTRON_EXECUTABLE_PATH: '../Electron/electron.exe'
      })
    ).toMatchObject({
      env: {
        FOLIOLE_ELECTRON_EXECUTABLE_PATH: '../Electron/electron.exe',
        FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1'
      },
      executablePath: expect.stringMatching(/Electron\/electron\.exe$/),
      timeout: 9_999
    });
  });

  it('waits for a non-blank desktop window before returning it', async () => {
    const calls = [];
    const windowPage = {
      async waitForFunction(pageFunction, arg, options) {
        calls.push(['waitForFunction', pageFunction, arg, options]);
      },
      async waitForLoadState(state, options) {
        calls.push(['waitForLoadState', state, options]);
      }
    };

    const stableWindow = await acquireStableDesktopWindow(
      {
        async firstWindow({ timeout }) {
          calls.push(['firstWindow', timeout]);
          return windowPage;
        }
      },
      4_321
    );

    expect(stableWindow).toBe(windowPage);
    expect(calls).toEqual([
      ['firstWindow', 4_321],
      ['waitForLoadState', 'domcontentloaded', { timeout: 4_321 }],
      ['waitForFunction', expect.any(Function), undefined, { timeout: 4_321 }]
    ]);
  });

  it('waits for the renderer app_ready flag before returning metadata', async () => {
    const calls = [];
    const appReady = await waitForDesktopAppReady(
      {
        async evaluate(pageFunction, appReadyFlag) {
          calls.push(['evaluate', pageFunction, appReadyFlag]);
          return {
            href: 'file:///workspace/foliole/dist/index.html',
            readyState: 'complete',
            reported: true
          };
        },
        async waitForFunction(pageFunction, appReadyFlag, options) {
          calls.push(['waitForFunction', pageFunction, appReadyFlag, options]);
        }
      },
      7_654
    );

    expect(appReady).toEqual({
      href: 'file:///workspace/foliole/dist/index.html',
      readyState: 'complete',
      reported: true
    });
    expect(calls).toEqual([
      ['waitForFunction', expect.any(Function), APP_READY_FLAG, { timeout: 7_654 }],
      ['evaluate', expect.any(Function), APP_READY_FLAG]
    ]);
  });

  it('launches electron and returns a reusable session envelope', async () => {
    const calls = [];
    let closed = false;
    const childProcess = {
      stderr: new EventEmitter(),
      stdout: new EventEmitter()
    };
    const windowPage = new EventEmitter();
    windowPage.evaluate = async (_pageFunction, appReadyFlag) => {
      if (appReadyFlag === APP_READY_FLAG) {
        return {
          href: 'file:///workspace/foliole/dist/index.html',
          readyState: 'complete',
          reported: true
        };
      }
      globalThis.__FOLIOLE_DESKTOP_DEBUG_PROBE__ = {
        getSnapshot: () => ({
          bridgeAvailable: true,
          recentInvokeFailures: [],
          recentInvokes: [{ command: 'resolve_app_paths', durationMs: 4, status: 'resolved', timestamp: 'now' }],
          runtimeHead: 'head-123'
        })
      };
      return _pageFunction();
    };
    windowPage.title = async () => 'Foliole';
    windowPage.url = () => 'file:///workspace/foliole/dist/index.html';
    windowPage.waitForFunction = async (pageFunction, argOrOptions, options) => {
      expect(pageFunction).toEqual(expect.any(Function));
      if (typeof argOrOptions === 'string') {
        expect(argOrOptions).toBe(APP_READY_FLAG);
        expect(options.timeout).toBeGreaterThan(0);
        return;
      }
      expect(argOrOptions).toBeUndefined();
      expect(options.timeout).toBeGreaterThan(0);
    };
    windowPage.waitForLoadState = async (state, options) => {
      expect(state).toBe('domcontentloaded');
      expect(options.timeout).toBeGreaterThan(0);
    };
    const electronLauncher = {
      async launch(options) {
        calls.push(options);
        return {
          async close() {
            closed = true;
          },
          async evaluate(pageFunction) {
            return pageFunction({
              app: {
                getAppPath: () => '/workspace/foliole',
                getName: () => 'foliole',
                isReady: () => true
              }
            });
          },
          process() {
            return childProcess;
          },
          async firstWindow({ timeout }) {
            expect(timeout).toBeGreaterThan(0);
            expect(timeout).toBeLessThanOrEqual(12_345);
            return windowPage;
          }
        };
      }
    };

    const session = await launchDesktopSession({
      appRoot: '/workspace/foliole',
      electronLauncher,
      env: { FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS: '12345' },
      existsSync: () => true
    });

    expect(calls).toEqual([
      {
        args: ['/workspace/foliole/electron-dist/electron/main.js'],
        cwd: '/workspace/foliole',
        env: {
          FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS: '12345',
          FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1'
        },
        executablePath: undefined,
        timeout: 12_345
      }
    ]);
    expect(session.target.launchMode).toBe('args');
    expect(session.appReady).toEqual({
      href: 'file:///workspace/foliole/dist/index.html',
      readyState: 'complete',
      reported: true
    });
    expect(session.snapshot).toEqual({
      appName: 'foliole',
      appPath: '/workspace/foliole',
      isReady: true
    });
    expect(await session.firstWindow.title()).toBe('Foliole');
    expect(session.collectDiagnostics).toEqual(expect.any(Function));

    childProcess.stdout.emit('data', Buffer.from('main ok\n'));

    await expect(session.collectDiagnostics()).resolves.toMatchObject({
      bridgeAvailable: true,
      mainProcessLogs: {
        stdoutTail: ['main ok\n']
      },
      nativeInvokeHistory: [expect.objectContaining({ command: 'resolve_app_paths', status: 'resolved' })],
      runtimeHead: 'head-123'
    });

    await session.close();
    await session.close();

    expect(closed).toBe(true);
  });

  it('fails fast when build output is missing', async () => {
    await expect(
      launchDesktopSession({
        appRoot: '/workspace/foliole',
        electronLauncher: { launch: async () => ({}) },
        existsSync: () => false
      })
    ).rejects.toThrow('missing build output');
  });
});
