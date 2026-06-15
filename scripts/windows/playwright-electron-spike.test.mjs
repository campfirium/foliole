import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { APP_READY_FLAG } from './playwright-desktop-harness.mjs';
import {
  resolveDefaultAppRoot,
  resolveElectronSpikeTarget,
  runElectronLaunchSpike
} from './playwright-electron-spike.mjs';

describe('playwright electron spike', () => {
  it('prefers configured app root over mirror detection', () => {
    const appRoot = resolveDefaultAppRoot({ FOLIOLE_ELECTRON_APP_ROOT: '/tmp/custom-root' });

    expect(appRoot).toBe(path.resolve('/tmp/custom-root'));
  });

  it('uses the current checkout by default outside Windows', () => {
    const appRoot = resolveDefaultAppRoot({});

    expect(appRoot).toBe(process.platform === 'win32' ? 'D:\\C\\foliole' : path.resolve('.'));
  });

  it('resolves current build output paths in args launch mode', () => {
    const appRoot = path.resolve('/workspace/foliole');
    const target = resolveElectronSpikeTarget('/workspace/foliole', () => true);

    expect(target.launchMode).toBe('args');
    expect(target.mainEntry).toBe(path.join(appRoot, 'electron-dist', 'electron', 'main.js'));
    expect(target.preloadPath).toBe(path.join(appRoot, 'electron', 'preload.cjs'));
    expect(target.rendererIndexPath).toBe(path.join(appRoot, 'dist', 'index.html'));
    expect(target.missingPaths).toEqual([]);
  });

  it('launches electron via args and captures first window metadata', async () => {
    const appRoot = path.resolve('/workspace/foliole');
    const stateRoot = path.resolve('/tmp/foliole-playwright-state');
    const electronName = process.platform === 'win32' ? 'electron.exe' : 'electron';
    const calls = [];
    let closed = false;
    const windowPage = {
      async evaluate(pageFunction, appReadyFlag) {
        if (appReadyFlag === undefined) {
          return true;
        }
        expect(appReadyFlag).toBe(APP_READY_FLAG);
        return {
          href: 'file:///workspace/foliole/dist/index.html',
          readyState: 'complete',
          reported: true
        };
      },
      async title() {
        return 'Foliole';
      },
      url() {
        return 'file:///workspace/foliole/dist/index.html';
      },
      async waitForFunction(pageFunction, argOrOptions, options) {
        expect(pageFunction).toEqual(expect.any(Function));
        if (typeof argOrOptions === 'string') {
          expect(argOrOptions).toBe(APP_READY_FLAG);
          expect(options.timeout).toBeGreaterThan(0);
          return;
        }
        expect(argOrOptions).toBeUndefined();
        expect(options.timeout).toBeGreaterThan(0);
      },
      async waitForLoadState(state, options) {
        expect(state).toBe('domcontentloaded');
        expect(options.timeout).toBeGreaterThan(0);
      }
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
          async firstWindow({ timeout }) {
            expect(timeout).toBeGreaterThan(0);
            expect(timeout).toBeLessThanOrEqual(12_345);
            return windowPage;
          },
          windows() {
            return [windowPage];
          },
          process() {
            return { pid: 4242 };
          }
        };
      }
    };

    const result = await runElectronLaunchSpike({
      appRoot: '/workspace/foliole',
      electronLauncher,
      env: {
        FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1',
        FOLIOLE_ELECTRON_SPIKE_TIMEOUT_MS: '12345',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: '/tmp/foliole-playwright-state'
      },
      existsSync: () => true
    });

    expect(calls).toEqual([
      {
        args: [path.join(appRoot, 'electron-dist', 'electron', 'main.js')],
        cwd: appRoot,
        env: {
          FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
          FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1',
          FOLIOLE_ELECTRON_SPIKE_TIMEOUT_MS: '12345',
          FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot,
          FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1',
          FOLIOLE_LIBRARY_HOME: path.join(stateRoot, 'library'),
          FOLIOLE_SESSION_DATA_PATH: path.join(stateRoot, 'session-data'),
          FOLIOLE_USER_DATA_PATH: path.join(stateRoot, 'user-data'),
          FOLIOLE_WORKDIR: stateRoot
        },
        executablePath: path.join(appRoot, 'node_modules', 'electron', 'dist', electronName),
        timeout: 12_345
      }
    ]);
    expect(result).toMatchObject({
      appName: 'foliole',
      appPath: '/workspace/foliole',
      appReady: true,
      firstWindowTitle: 'Foliole',
      firstWindowUrl: 'file:///workspace/foliole/dist/index.html',
      launchMode: 'args',
      processPid: 4242
    });
    expect(closed).toBe(true);
  });

  it('fails fast when build output is missing', async () => {
    await expect(
      runElectronLaunchSpike({
        appRoot: '/workspace/foliole',
        electronLauncher: { launch: async () => ({}) },
        existsSync: () => false
      })
    ).rejects.toThrow('missing build output');
  });
});
