// @vitest-environment node

import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  APP_READY_FLAG,
  launchDesktopSession
} from './playwright-desktop-harness.mjs';

describe('playwright desktop harness', () => {
  it('launches electron and returns a reusable session envelope', async () => {
    const calls = [];
    let closed = false;
    const childProcess = {
      pid: 4821,
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
          preloadPath: '/workspace/foliole/electron/preload.cjs',
          recentInvokeFailures: [],
          recentInvokes: [{ command: 'resolve_app_paths', durationMs: 4, status: 'resolved', timestamp: 'now' }],
          runtimeHead: 'head-123'
        })
      };
      const previousLocation = globalThis.location;
      const previousDocument = globalThis.document;
      globalThis.location = { href: 'file:///workspace/foliole/dist/index.html' };
      globalThis.document = {
        getElementById: (id) => id === 'root' ? {} : null,
        readyState: 'complete'
      };
      try {
        return _pageFunction();
      } finally {
        globalThis.location = previousLocation;
        globalThis.document = previousDocument;
      }
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
          },
          windows() {
            return [windowPage];
          }
        };
      }
    };

    const session = await launchDesktopSession({
      appRoot: '/workspace/foliole',
      electronLauncher,
      env: {
        FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1',
        FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS: '12345',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: '/tmp/foliole-playwright-state'
      },
      existsSync: (filePath) => filePath !== '/workspace/foliole/node_modules/electron/dist/electron.exe'
    });

    expect(calls).toEqual([
      {
        args: ['/workspace/foliole/electron-dist/electron/main.js'],
        cwd: '/workspace/foliole',
        env: {
          FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
          FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1',
          FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS: '12345',
          FOLIOLE_ELECTRON_TEST_STATE_ROOT: '/tmp/foliole-playwright-state',
          FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1',
          FOLIOLE_SESSION_DATA_PATH: '/tmp/foliole-playwright-state/session-data',
          FOLIOLE_USER_DATA_PATH: '/tmp/foliole-playwright-state/user-data',
          FOLIOLE_WORKDIR: '/tmp/foliole-playwright-state'
        },
        executablePath: '/workspace/foliole/node_modules/electron/dist/electron',
        timeout: 12_345
      }
    ]);
    expect(session.target.launchMode).toBe('args');
    expect(session.target.runtimeStateRoot).toBe('/tmp/foliole-playwright-state');
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
      currentRuntime: {
        appReady: true,
        bridgeAvailable: true,
        pid: 4821,
        preloadPath: '/workspace/foliole/electron/preload.cjs',
        rendererUrl: 'file:///workspace/foliole/dist/index.html'
      },
      mainProcessLogs: {
        pid: 4821,
        stdoutTail: ['main ok\n']
      },
      nativeInvokeHistory: [expect.objectContaining({ command: 'resolve_app_paths', status: 'resolved' })],
      rendererPage: {
        pageUrl: 'file:///workspace/foliole/dist/index.html',
        readyState: 'complete',
        rootPresent: true,
        title: null,
        url: 'file:///workspace/foliole/dist/index.html'
      },
      rendererPageEvents: [],
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
