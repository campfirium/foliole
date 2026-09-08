import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { ElectronApplication, Locator, TestInfo } from '@playwright/test';

import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from '../../scripts/desktop/macos-hidden-electron-credential-session.mjs';
import { prepareMacosHiddenElectronRuntime } from '../../scripts/desktop/macos-hidden-electron-runtime.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { connectAndCutoverReadwiseApi, expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const AUTH_URL = 'https://readwise.io/api/v2/auth/';
const TEST_TOKEN = 't178-acceptance-token';
type AcceptanceSession = Pick<DesktopSession, 'close' | 'electronApp' | 'firstWindow'>;

async function launchMacosCredentialSession(input: {
  executablePath: string;
  session: ReturnType<typeof resolveMacosHiddenCredentialSession>;
  stateRoot: string;
}): Promise<AcceptanceSession> {
  const { _electron } = await import('playwright');
  const rendererUrl = pathToFileURL(path.resolve('dist/desktop/index.html')).toString();
  const electronApp = await _electron.launch({
    args: [input.session.bootstrapPath], cwd: process.cwd(), executablePath: input.executablePath,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl,
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: input.stateRoot,
      FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: input.session.appName,
      FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: path.resolve('dist/electron/main.js'),
      FOLIOLE_LIBRARY_HOME: path.join(input.stateRoot, 'library'),
      FOLIOLE_SESSION_DATA_PATH: input.session.userDataPath,
      FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1',
      FOLIOLE_USER_DATA_PATH: input.session.userDataPath,
      FOLIOLE_WORKDIR: input.stateRoot
    },
    timeout: 90_000
  });
  const firstWindow = await electronApp.firstWindow({ timeout: 30_000 });
  await firstWindow.waitForURL(rendererUrl, { timeout: 30_000 });
  await firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
  return { close: () => electronApp.close(), electronApp, firstWindow };
}

async function createAcceptanceFixture() {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-2-'));
  if (process.platform !== 'darwin') {
    return {
      close: () => rm(stateRoot, { force: true, recursive: true }),
      launch: () => launchDesktopSession({ env: {
        ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      } }) as Promise<AcceptanceSession>
    };
  }
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot: process.cwd(), env: process.env });
  const credentialSession = resolveMacosHiddenCredentialSession(
    process.cwd(), runtime.runtimeFingerprint, stateRoot
  );
  const release = acquireMacosHiddenCredentialSessionLock(credentialSession);
  return {
    close: async () => {
      release();
      runtime.cleanup();
      await rm(stateRoot, { force: true, recursive: true });
    },
    launch: () => launchMacosCredentialSession({
      executablePath: runtime.executablePath, session: credentialSession, stateRoot
    })
  };
}

async function capture(dialog: Locator, testInfo: TestInfo, name: string) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const screenshotPath = path.join(ARTIFACT_DIR, `${name}-${process.platform}.png`);
  await dialog.screenshot({ path: screenshotPath });
  await testInfo.attach(name, { contentType: 'image/png', path: screenshotPath });
}

async function installAuthFixture(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ clipboard }, fixture) => {
    const scope = globalThis as typeof globalThis & { __t178AuthCalls?: number };
    scope.__t178AuthCalls = 0;
    scope.fetch = async (input, init) => {
      if (String(input) !== fixture.authUrl || init?.method !== 'GET') {
        throw new Error('unexpected_readwise_auth_request');
      }
      if (new Headers(init.headers).get('Authorization') !== `Token ${fixture.token}`) {
        throw new Error('unexpected_readwise_auth_header');
      }
      scope.__t178AuthCalls = (scope.__t178AuthCalls ?? 0) + 1;
      return new Response(null, { status: 204 });
    };
    clipboard.writeText(fixture.token);
  }, { authUrl: AUTH_URL, token: TEST_TOKEN });
}

async function openReadwiseSettings(session: AcceptanceSession) {
  await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
  await expectWorkspaceShell(session.firstWindow);
  return openSettingsCategory(session.firstWindow, 'ReadwiseReader');
}

async function setRemoteActiveHost(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async (_electron, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const assignment = require(pathApi.join(cwd, 'dist/electron/database/readwiseHostAssignment.js'));
    const settings = require(pathApi.join(cwd, 'dist/electron/database/settingsStore.js'));
    const currentHost = assignment.loadReadwiseHostAssignment().current_host_name;
    connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      driver.execute(`INSERT INTO sync_groups
        (group_id, display_name, workgroup_key, created_at, updated_at)
        VALUES ('t178-2-group', 'Workgroup', 't178-2-key', 'now', 'now')`);
      driver.execute(`INSERT INTO sync_group_local_state
        (singleton_id, group_id, local_device_identity_key, state, updated_at)
        VALUES (1, 't178-2-group', 't178-2-current', 'active', 'now')`);
      const insertDevice = (identity: string, name: string, platform: string) => driver.execute(
        `INSERT INTO sync_group_devices
          (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
           platform, state, joined_at, left_at, last_seen_at, updated_at)
         VALUES ('t178-2-group', ?, ?, ?, ?, ?, 'active', 'now', NULL, 'now', 'now')`,
        [identity, `${identity}-anchor`, `/library/${identity}`, name, platform]
      );
      insertDevice('t178-2-current', currentHost, process.platform);
      insertDevice('t178-2-remote', 'Other Desktop', process.platform === 'win32' ? 'darwin' : 'win32');
      settings.saveJsonSetting('readwise_active_host', { host_name: 'Other Desktop' });
    });
  }, process.cwd());
}

test('connects, restores, disconnects, and hides API controls on a non-active Host', async ({
  browserName
}, testInfo) => {
  void browserName;
  const fixture = await createAcceptanceFixture();
  let first: AcceptanceSession | null = null;
  let restarted: AcceptanceSession | null = null;
  try {
    first = await fixture.launch();
    const dialog = await openReadwiseSettings(first);
    await installAuthFixture(first.electronApp);
    await connectAndCutoverReadwiseApi(first.firstWindow, dialog);
    await expect.poll(() => first!.firstWindow.evaluate(async () => (
      await globalThis.window?.electronAPI?.invoke('load_import_manager_settings')
    )?.readwiseSourceMode)).toBe('api');

    expect(await first.electronApp.evaluate(() => (
      globalThis as typeof globalThis & { __t178AuthCalls?: number }
    ).__t178AuthCalls)).toBe(1);
    const publicState = await first.firstWindow.evaluate(async () => (
      globalThis.window?.electronAPI?.invoke('load_readwise_api_connection')
    ));
    expect(publicState).toEqual(expect.objectContaining({ has_credential: true, state: 'connected' }));
    expect(JSON.stringify(publicState)).not.toContain(TEST_TOKEN);
    await capture(dialog, testInfo, 't178-2-readwise-api-connected');

    await first.close();
    first = null;
    restarted = await fixture.launch();
    const restartedDialog = await openReadwiseSettings(restarted);
    await expect(restartedDialog.getByText(/^(Connected|已连接)$/)).toBeVisible();
    await capture(restartedDialog, testInfo, 't178-2-readwise-api-restored');

    await restartedDialog.getByRole('button', { name: /^(Disconnect|断开)$/ }).click();
    await expect(restartedDialog.getByText(/^(Not connected|未连接)$/)).toBeVisible();
    await setRemoteActiveHost(restarted.electronApp);
    await restarted.firstWindow.reload();
    await expectWorkspaceShell(restarted.firstWindow);
    const remoteDialog = await openSettingsCategory(restarted.firstWindow, 'ReadwiseReader');
    await expect(remoteDialog.getByRole('button', {
      name: /^(Switch to this host|切换到此主机)$/
    })).toBeVisible();
    await expect(remoteDialog.getByRole('button', {
      name: /^(Connect Readwise|连接 Readwise)$/
    })).toHaveCount(0);
    await capture(remoteDialog, testInfo, 't178-2-readwise-api-non-active-host');
  } finally {
    await first?.close();
    await restarted?.close();
    await fixture.close();
  }
});
