import path from 'node:path';
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

    expect(appRoot).toBe('/tmp/custom-root');
  });

  it('uses the fixed windows mirror root by default', () => {
    const appRoot = resolveDefaultAppRoot({});

    expect(appRoot).toBe('/mnt/c/dev/foliole');
  });

  it('resolves current build output paths in args launch mode', () => {
    const target = resolveElectronSpikeTarget('/workspace/foliole', () => true);

    expect(target.launchMode).toBe('args');
    expect(target.mainEntry).toBe('/workspace/foliole/electron-dist/electron/main.js');
    expect(target.preloadPath).toBe('/workspace/foliole/electron/preload.cjs');
    expect(target.rendererIndexPath).toBe('/workspace/foliole/dist/index.html');
    expect(target.missingPaths).toEqual([]);
  });

  it('launches electron via args and captures first window metadata', async () => {
    const calls = [];
    let closed = false;
    const windowPage = {
      async evaluate(pageFunction, appReadyFlag) {
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
        FOLIOLE_ELECTRON_SPIKE_TIMEOUT_MS: '12345',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: '/tmp/foliole-playwright-state'
      },
      existsSync: () => true
    });

    expect(calls).toEqual([
      {
        args: ['/workspace/foliole/electron-dist/electron/main.js'],
        cwd: '/workspace/foliole',
        env: {
          FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
          FOLIOLE_ELECTRON_SPIKE_TIMEOUT_MS: '12345',
          FOLIOLE_ELECTRON_TEST_STATE_ROOT: '/tmp/foliole-playwright-state',
          FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: '1',
          FOLIOLE_SESSION_DATA_PATH: path.join('/tmp/foliole-playwright-state', 'session-data'),
          FOLIOLE_USER_DATA_PATH: path.join('/tmp/foliole-playwright-state', 'user-data'),
          FOLIOLE_WORKDIR: '/tmp/foliole-playwright-state'
        },
        executablePath: '/workspace/foliole/node_modules/electron/dist/electron.exe',
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
