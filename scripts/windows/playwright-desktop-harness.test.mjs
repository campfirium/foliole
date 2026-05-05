import { describe, expect, it } from 'vitest';

import {
  createDesktopLaunchOptions,
  launchDesktopSession,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget
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
      preloadPath: '/workspace/foliole/electron-dist/preload.cjs',
      rendererIndexPath: '/workspace/foliole/dist/index.html'
    });
  });

  it('creates args-based launch options with optional executable override', () => {
    const target = resolveDesktopLaunchTarget('/workspace/foliole', () => true);

    expect(createDesktopLaunchOptions(target, 12_345, {})).toEqual({
      args: ['/workspace/foliole/electron-dist/electron/main.js'],
      cwd: '/workspace/foliole',
      executablePath: undefined,
      timeout: 12_345
    });

    expect(
      createDesktopLaunchOptions(target, 9_999, {
        FOLIOLE_ELECTRON_EXECUTABLE_PATH: '../Electron/electron.exe'
      })
    ).toMatchObject({
      executablePath: expect.stringMatching(/Electron\/electron\.exe$/),
      timeout: 9_999
    });
  });

  it('launches electron and returns a reusable session envelope', async () => {
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
        executablePath: undefined,
        timeout: 12_345
      }
    ]);
    expect(session.target.launchMode).toBe('args');
    expect(session.snapshot).toEqual({
      appName: 'foliole',
      appPath: '/workspace/foliole',
      isReady: true
    });
    expect(await session.firstWindow.title()).toBe('Foliole');

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
