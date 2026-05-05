import { describe, expect, it } from 'vitest';

import {
  resolveDefaultAppRoot,
  resolveElectronSpikeTarget,
  runElectronLaunchSpike
} from './playwright-electron-spike.mjs';

describe('playwright electron spike', () => {
  it('prefers configured app root over mirror detection', () => {
    const appRoot = resolveDefaultAppRoot(
      { FOLIOLE_ELECTRON_APP_ROOT: '/tmp/custom-root' },
      () => true
    );

    expect(appRoot).toBe('/tmp/custom-root');
  });

  it('resolves current build output paths in args launch mode', () => {
    const target = resolveElectronSpikeTarget('/workspace/foliole', () => true);

    expect(target.launchMode).toBe('args');
    expect(target.mainEntry).toBe('/workspace/foliole/electron-dist/electron/main.js');
    expect(target.preloadPath).toBe('/workspace/foliole/electron-dist/preload.cjs');
    expect(target.rendererIndexPath).toBe('/workspace/foliole/dist/index.html');
    expect(target.missingPaths).toEqual([]);
  });

  it('launches electron via args and captures first window metadata', async () => {
    const calls = [];
    let closed = false;
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
            expect(timeout).toBe(12_345);
            return {
              async title() {
                return 'Foliole';
              },
              url() {
                return 'file:///workspace/foliole/dist/index.html';
              }
            };
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
      env: { FOLIOLE_ELECTRON_SPIKE_TIMEOUT_MS: '12345' },
      existsSync: () => true
    });

    expect(calls).toEqual([
      {
        args: ['/workspace/foliole/electron-dist/electron/main.js'],
        cwd: '/workspace/foliole',
        executablePath: undefined,
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
