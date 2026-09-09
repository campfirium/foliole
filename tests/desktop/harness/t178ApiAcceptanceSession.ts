import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from '../../../scripts/desktop/macos-hidden-electron-credential-session.mjs';
import { prepareMacosHiddenElectronRuntime } from '../../../scripts/desktop/macos-hidden-electron-runtime.mjs';
import { launchDesktopSession } from '../../../scripts/desktop/playwright-desktop-harness.mjs';

import type { DesktopSession } from './fixtures';

export type T178AcceptanceSession = Pick<DesktopSession, 'close' | 'electronApp' | 'firstWindow'>;

async function launchMacosSession(executablePath: string, stateRoot: string): Promise<T178AcceptanceSession> {
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot: process.cwd(), env: process.env });
  const credential = resolveMacosHiddenCredentialSession(process.cwd(), runtime.runtimeFingerprint, stateRoot);
  const release = acquireMacosHiddenCredentialSessionLock(credential);
  const { _electron } = await import('playwright');
  const rendererUrl = pathToFileURL(path.resolve('dist/desktop/index.html')).toString();
  const electronApp = await _electron.launch({
    args: [credential.bootstrapPath], cwd: process.cwd(), executablePath,
    env: {
      ...process.env, ELECTRON_RENDERER_URL: rendererUrl, FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1', FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1', FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot,
      FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: credential.appName,
      FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: path.resolve('dist/electron/main.js'),
      FOLIOLE_LIBRARY_HOME: path.join(stateRoot, 'library'),
      FOLIOLE_SESSION_DATA_PATH: credential.userDataPath, FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1',
      FOLIOLE_USER_DATA_PATH: credential.userDataPath, FOLIOLE_WORKDIR: stateRoot
    },
    timeout: 90_000
  });
  const firstWindow = await electronApp.firstWindow({ timeout: 30_000 });
  await firstWindow.waitForURL(rendererUrl, { timeout: 30_000 });
  await firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
  return {
    close: async () => {
      try { await electronApp.close(); } finally { release(); runtime.cleanup(); }
    },
    electronApp,
    firstWindow
  };
}

export async function createT178ApiAcceptanceSession(stateRoot: string) {
  if (process.platform !== 'darwin') {
    return launchDesktopSession({ env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot } }) as
      Promise<T178AcceptanceSession>;
  }
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot: process.cwd(), env: process.env });
  const executablePath = runtime.executablePath;
  runtime.cleanup();
  return launchMacosSession(executablePath, stateRoot);
}
