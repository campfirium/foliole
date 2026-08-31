import { access, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import {
  acquireMacosHiddenCredentialSessionLock,
  resolveMacosHiddenCredentialSession
} from '../../scripts/desktop/macos-hidden-electron-credential-session.mjs';
import { prepareMacosHiddenElectronRuntime } from '../../scripts/desktop/macos-hidden-electron-runtime.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const API_KEY = 'sk-foliole-t141-hidden-native-secret';
const ENDPOINT = 'http://127.0.0.1:4141/v1/chat/completions';
const MODEL = 'foliole-t141-model';

type CredentialFixture = Awaited<ReturnType<typeof createCredentialFixture>>;

async function createCredentialFixture() {
  const appRoot = process.cwd();
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t141-byok-'));
  const runtime = prepareMacosHiddenElectronRuntime({ appRoot, env: process.env });
  const session = resolveMacosHiddenCredentialSession(appRoot, runtime.runtimeFingerprint, stateRoot);
  const release = acquireMacosHiddenCredentialSessionLock(session);
  return {
    close: async () => {
      release();
      runtime.cleanup();
      await rm(stateRoot, { force: true, recursive: true });
    },
    launch: () => launchCredentialApp({ appRoot, executablePath: runtime.executablePath, session, stateRoot }),
    secretPath: path.join(session.userDataPath, 'foliole-aide-byok-secret.bin'),
    stateRoot
  };
}

async function launchCredentialApp(input: {
  appRoot: string;
  executablePath: string;
  session: ReturnType<typeof resolveMacosHiddenCredentialSession>;
  stateRoot: string;
}) {
  const { _electron } = await import('playwright');
  const rendererUrl = pathToFileURL(path.join(input.appRoot, 'dist/desktop/index.html')).toString();
  const electronApp = await _electron.launch({
    args: [input.session.bootstrapPath], cwd: input.appRoot, executablePath: input.executablePath,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl,
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
      FOLIOLE_DISABLE_IN_APP_RELAUNCH: '1',
      FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: input.stateRoot,
      FOLIOLE_HIDDEN_CREDENTIAL_APP_NAME: input.session.appName,
      FOLIOLE_HIDDEN_CREDENTIAL_MAIN_PATH: path.join(input.appRoot, 'dist/electron/main.js'),
      FOLIOLE_LIBRARY_HOME: path.join(input.stateRoot, 'library'),
      FOLIOLE_SESSION_DATA_PATH: input.session.userDataPath,
      FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1',
      FOLIOLE_USER_DATA_PATH: input.session.userDataPath,
      FOLIOLE_WORKDIR: input.stateRoot
    },
    timeout: 90_000
  });
  const page = await electronApp.firstWindow({ timeout: 30_000 });
  await page.waitForURL(rendererUrl, { timeout: 30_000 });
  await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
  await page.setViewportSize({ width: 1600, height: 1000 });
  return { electronApp, page };
}

async function expectSecureStorageReady(electronApp: ElectronApplication) {
  await expect.poll(() => electronApp.evaluate(({ safeStorage }) => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const probe = 'foliole-t141-secure-storage-probe';
    return safeStorage.decryptString(safeStorage.encryptString(probe)) === probe;
  }), { timeout: 10_000 }).toBe(true);
}

async function openByokSection(page: Page) {
  const settings = await openSettingsCategory(page, 'General');
  const section = settings.getByLabel(/^(Your model settings|你的模型设置)$/);
  await expect(section).toBeVisible();
  return section;
}

async function saveConfiguration(page: Page) {
  const section = await openByokSection(page);
  await section.getByLabel(/^(Model API endpoint|模型 API 端点)$/).fill(ENDPOINT);
  await section.getByLabel(/^(Model name|模型名称)$/).fill(MODEL);
  await section.getByLabel(/^(Model API key|模型 API key)$/).fill(API_KEY);
  await section.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(section).toContainText(/(?:Ready to use|已可在 Foliole Aide 中使用)/);
  await expect(section.getByLabel(/^(Model API key|模型 API key)$/)).toHaveValue('');
}

async function expectRestoredConfiguration(page: Page) {
  const section = await openByokSection(page);
  await expect(section.getByLabel(/^(Model API endpoint|模型 API 端点)$/)).toHaveValue(ENDPOINT);
  await expect(section.getByLabel(/^(Model name|模型名称)$/)).toHaveValue(MODEL);
  const key = section.getByLabel(/^(Model API key|模型 API key)$/);
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', '••••••••');
  await expect(section.getByRole('button', { name: /^(Remove|移除)$/ })).toBeVisible();
  return section;
}

async function containsPlaintextSecret(root: string): Promise<boolean> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (await containsPlaintextSecret(target)) return true;
      continue;
    }
    if (!entry.isFile() || (await stat(target)).size > 50_000_000) continue;
    if ((await readFile(target)).includes(Buffer.from(API_KEY))) return true;
  }
  return false;
}

async function expectNoRendererSecret(page: Page) {
  const values = await page.evaluate(() => [
    ...Object.keys(localStorage).map((key) => localStorage.getItem(key)),
    ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key))
  ]);
  expect(JSON.stringify(values)).not.toContain(API_KEY);
}

async function captureSection(page: Page, testInfo: TestInfo) {
  const section = await expectRestoredConfiguration(page);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const screenshotPath = path.join(ARTIFACT_DIR, 't141-aide-byok-settings-hidden.png');
  await section.screenshot({ path: screenshotPath });
  await testInfo.attach('t141-aide-byok-settings', { contentType: 'image/png', path: screenshotPath });
}

async function runCredentialJourney(fixture: CredentialFixture, testInfo: TestInfo) {
  const first = await fixture.launch();
  await expectWorkspaceShell(first.page);
  await expectSecureStorageReady(first.electronApp);
  await saveConfiguration(first.page);
  await expectNoRendererSecret(first.page);
  await expect(access(fixture.secretPath)).resolves.toBeUndefined();
  expect(await containsPlaintextSecret(fixture.stateRoot)).toBe(false);
  await first.electronApp.close();

  const second = await fixture.launch();
  try {
    await expectWorkspaceShell(second.page);
    await captureSection(second.page, testInfo);
    await expectNoRendererSecret(second.page);
    const section = await openByokSection(second.page);
    await section.getByRole('button', { name: /^(Remove|移除)$/ }).click();
    await expect(section.getByLabel(/^(Model API endpoint|模型 API 端点)$/)).toHaveValue('');
    await expect(section.getByLabel(/^(Model name|模型名称)$/)).toHaveValue('');
    await expect(section.getByRole('button', { name: /^(Remove|移除)$/ })).toHaveCount(0);
    await expect(access(fixture.secretPath)).rejects.toThrow();
  } finally {
    await second.electronApp.close();
  }
}

test('keeps a device-local encrypted Aide model configuration across relaunch and removes it', async ({
  browserName
}, testInfo) => {
  void browserName;
  // SKIP: macOS safeStorage acceptance | 2026-08-31 | revive: run this acceptance on a macOS host
  test.skip(process.platform !== 'darwin', 'macOS-only secure storage journey');
  const fixture = await createCredentialFixture();
  try {
    await runCredentialJourney(fixture, testInfo);
  } finally {
    await fixture.close();
  }
});
