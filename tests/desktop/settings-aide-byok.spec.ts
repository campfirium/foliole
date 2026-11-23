import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
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

import { fillModelDraft, openModelSettings } from './assistant-byok-loopback-ui.support';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

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
    secretDir: session.userDataPath,
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

// Each custom model keeps its encrypted key in its own foliole-aide-model-<id>.bin file.
async function hasModelSecret(secretDir: string) {
  return (await readdir(secretDir)).some((name) => /^foliole-aide-model-.+\.bin$/u.test(name));
}

async function saveConfiguration(page: Page, secretDir: string) {
  const section = await openModelSettings(page);
  const addButton = section.getByRole('button', { name: /^(Add model|添加模型)$/ });
  if (await addButton.isVisible().catch(() => false)) await addButton.click();
  // Model drafts save as they are typed; the key goes to the device's secure storage.
  await fillModelDraft(section, { apiKey: API_KEY, endpoint: ENDPOINT, model: MODEL });
  await expect.poll(() => hasModelSecret(secretDir), { timeout: 10_000 }).toBe(true);
}

async function expectRestoredConfiguration(page: Page) {
  const section = await openModelSettings(page);
  await expect(section.getByLabel(/^(API endpoint|API 地址)$/).first()).toHaveValue(ENDPOINT);
  await expect(section.getByLabel(/^(Model|模型)$/).first()).toHaveValue(MODEL);
  const key = section.getByLabel(/^(API key|API 密钥)$/).first();
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', '•'.repeat(API_KEY.length));
  await expect(section.getByRole('button', { name: /^(Remove model|删除模型)$/ })).toBeVisible();
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
  await saveConfiguration(first.page, fixture.secretDir);
  await expectNoRendererSecret(first.page);
  expect(await containsPlaintextSecret(fixture.stateRoot)).toBe(false);
  await first.electronApp.close();

  const second = await fixture.launch();
  try {
    await expectWorkspaceShell(second.page);
    await captureSection(second.page, testInfo);
    await expectNoRendererSecret(second.page);
    const section = await openModelSettings(second.page);
    await section.getByRole('button', { name: /^(Remove model|删除模型)$/ }).click();
    await expect(section.getByLabel(/^(Model|模型)$/)).toHaveCount(0);
    await expect(section.getByRole('button', { name: /^(Remove model|删除模型)$/ })).toHaveCount(0);
    await expect.poll(() => hasModelSecret(fixture.secretDir)).toBe(false);
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
