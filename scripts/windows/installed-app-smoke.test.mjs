// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  resolveInstalledAppExePath,
  resolveInstalledAppSmokeEnv,
  runInstalledAppSmoke
} from './installed-app-smoke.mjs';

describe('installed app smoke', () => {
  it('resolves the default per-user Foliole install path', () => {
    const expectedPath = 'C:\\Users\\me\\AppData\\Local\\Programs\\Foliole\\Foliole.exe';

    expect(resolveInstalledAppExePath({
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local'
    }, (filePath) => filePath === expectedPath)).toBe(expectedPath);
  });

  it('fails before launching when no installed executable can be found', () => {
    expect(() => resolveInstalledAppExePath({
      FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: 'D:\\missing\\Foliole.exe'
    }, () => false)).toThrow('Installed Foliole executable was not found');
  });

  it('launches the installed executable through the isolated Playwright harness', async () => {
    const calls = [];
    const result = await runInstalledAppSmoke({
      env: {
        FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: 'D:\\Apps\\Foliole\\Foliole.exe'
      },
      exists: () => true,
      launchSession: async (options) => {
        calls.push(options);
        return {
          appReady: { href: 'app://foliole', readyState: 'complete', reported: true },
          close: async () => {},
          snapshot: { appName: 'Foliole' },
          target: { launchMode: 'installed' }
        };
      }
    });

    expect(calls).toEqual([{
      env: expect.objectContaining({
        FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: 'D:\\Apps\\Foliole\\Foliole.exe',
        FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
        FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1'
      })
    }]);
    expect(result).toMatchObject({
      appName: 'Foliole',
      executablePath: 'D:\\Apps\\Foliole\\Foliole.exe',
      launchMode: 'installed'
    });
  });

  it('marks installed smoke as packaged-app launch mode', () => {
    expect(resolveInstalledAppSmokeEnv({})).toMatchObject({
      FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
      FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1'
    });
  });
});
