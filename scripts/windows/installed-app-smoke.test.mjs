// @vitest-environment node

import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import {
  resolveInstalledAppExePath,
  resolveInstalledAppSmokeEnv,
  runInstalledAppSmoke,
  waitForInstalledReadyMarkers
} from './installed-app-smoke.mjs';

const WIN_SEP = String.fromCharCode(92);
const winPath = (...parts) => parts.join(WIN_SEP);

describe('installed app smoke', () => {
  it('resolves the default per-user Foliole install path', () => {
    const localAppData = winPath('C:', 'Users', 'me', 'AppData', 'Local');
    const expectedPath = winPath(localAppData, 'Programs', 'Foliole', 'Foliole.exe');

    expect(resolveInstalledAppExePath({
      LOCALAPPDATA: localAppData
    }, (filePath) => filePath === expectedPath)).toBe(expectedPath);
  });

  it('fails before launching when no installed executable can be found', () => {
    expect(() => resolveInstalledAppExePath({
      FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: winPath('D:', 'missing', 'Foliole.exe')
    }, () => false)).toThrow('Installed Foliole executable was not found');
  });

  it('launches the installed executable and waits for isolated ready markers', async () => {
    const calls = [];
    const executablePath = winPath('D:', 'Apps', 'Foliole', 'Foliole.exe');
    const child = {
      exitCode: null,
      kill: () => {},
      pid: 1234,
      stderr: new EventEmitter(),
      stdout: new EventEmitter()
    };
    const isolation = {
      cleanup: () => calls.push({ type: 'cleanup' }),
      env: {
        FOLIOLE_LIBRARY_HOME: winPath('T:', 'smoke', 'library'),
        FOLIOLE_SESSION_DATA_PATH: winPath('T:', 'smoke', 'session-data'),
        FOLIOLE_USER_DATA_PATH: winPath('T:', 'smoke', 'user-data'),
        FOLIOLE_WORKDIR: winPath('T:', 'smoke')
      },
      runtimeStateRoot: winPath('T:', 'smoke')
    };
    const result = await runInstalledAppSmoke({
      env: {
        FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: executablePath
      },
      exists: () => true,
      createIsolation: () => isolation,
      launchApp: (exePath, launchEnv) => {
        calls.push({ exePath, launchEnv, type: 'launch' });
        return { child, outputTail: [] };
      },
      now: () => 42,
      resetMarkers: (stateRoot) => calls.push({ stateRoot, type: 'reset' }),
      stopRuntime: (pid) => calls.push({ pid, type: 'stop' }),
      waitForMarkers: async (input) => {
        calls.push({ input, type: 'wait' });
        return {
          appReady: { pid: 4321, session: input.session, stage: 'app_ready' },
          bridgeReady: {
            payload: { bridgeAvailable: true },
            pid: 4321,
            session: input.session,
            stage: 'bridge_ready'
          }
        };
      }
    });

    expect(calls).toEqual([
      { stateRoot: winPath('T:', 'smoke'), type: 'reset' },
      {
        exePath: executablePath,
        launchEnv: expect.objectContaining({
          FOLIOLE_BOOT_SESSION: 'installed-app-smoke-42',
          FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
          FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: executablePath,
          FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
          FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1',
          FOLIOLE_WORKDIR: winPath('T:', 'smoke')
        }),
        type: 'launch'
      },
      {
        input: expect.objectContaining({
          electron: child,
          pid: 1234,
          repoRoot: winPath('T:', 'smoke'),
          session: 'installed-app-smoke-42',
          timeoutMs: expect.any(Number)
        }),
        type: 'wait'
      },
      { pid: 1234, type: 'stop' },
      { pid: 4321, type: 'stop' },
      { type: 'cleanup' }
    ]);
    expect(result).toMatchObject({
      executablePath,
      launchMode: 'installed',
      runtimePid: 4321,
      session: 'installed-app-smoke-42'
    });
  });

  it('marks installed smoke as packaged-app launch mode', () => {
    expect(resolveInstalledAppSmokeEnv({})).toMatchObject({
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
      FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1'
    });
  });

  it('waits for markers even when the launcher process already exited', async () => {
    const session = 'installed-app-smoke-exited-launcher';
    const markers = new Map([
      ['.windows-native-boot-ready.json', {
        pid: 4321,
        session,
        stage: 'app_ready'
      }],
      ['.windows-native-bridge-ready.json', {
        payload: { bridgeAvailable: true },
        pid: 4321,
        session,
        stage: 'bridge_ready'
      }]
    ]);
    await expect(waitForInstalledReadyMarkers({
      electron: { exitCode: 2147483651 },
      pid: 1234,
      readMarker: (_repoRoot, name) => markers.get(name),
      repoRoot: winPath('T:', 'smoke'),
      session,
      timeoutMs: 10
    })).resolves.toMatchObject({
      appReady: { pid: 4321 },
      bridgeReady: { pid: 4321 }
    });
  });
});
