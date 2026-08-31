import { access, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { Page, TestInfo } from '@playwright/test';

import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const API_KEY = 'sk-foliole-t141-hidden-native-secret';
const ENDPOINT = 'http://127.0.0.1:4141/v1/chat/completions';
const MODEL = 'foliole-t141-model';

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
  return section;
}

async function expectRestoredConfiguration(page: Page) {
  const section = await openByokSection(page);
  await expect(section.getByLabel(/^(Model API endpoint|模型 API 端点)$/)).toHaveValue(`${ENDPOINT}`);
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
  const values = await page.evaluate(() => {
    const local = Object.keys(localStorage).map((key) => localStorage.getItem(key));
    const session = Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key));
    return [...local, ...session];
  });
  expect(JSON.stringify(values)).not.toContain(API_KEY);
}

async function captureSection(page: Page, testInfo: TestInfo) {
  const section = await expectRestoredConfiguration(page);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const screenshotPath = path.join(ARTIFACT_DIR, 't141-aide-byok-settings-hidden.png');
  await section.screenshot({ path: screenshotPath });
  await testInfo.attach('t141-aide-byok-settings', { contentType: 'image/png', path: screenshotPath });
}

test('keeps a device-local encrypted Aide model configuration across relaunch and removes it', async ({
  desktopSession
}, testInfo) => {
  // SKIP: macOS safeStorage acceptance | 2026-08-31 | revive: run this acceptance on a macOS host
  test.skip(process.platform !== 'darwin', 'macOS-only secure storage journey');
  let secondSession: DesktopSession | null = null;
  const stateRoot = desktopSession.target.runtimeStateRoot;
  const userData = await desktopSession.electronApp.evaluate(({ app }) => app.getPath('userData'));
  const secretPath = path.join(userData, 'foliole-aide-byok-secret.bin');

  try {
    await expectWorkspaceShell(desktopSession.firstWindow);
    await saveConfiguration(desktopSession.firstWindow);
    await expectNoRendererSecret(desktopSession.firstWindow);
    await expect(access(secretPath)).resolves.toBeUndefined();
    expect(await containsPlaintextSecret(stateRoot)).toBe(false);

    await closeDesktopApplication(desktopSession.electronApp);
    secondSession = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    }) as DesktopSession;
    await secondSession.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await expectWorkspaceShell(secondSession.firstWindow);
    await captureSection(secondSession.firstWindow, testInfo);
    await expectNoRendererSecret(secondSession.firstWindow);

    const section = await openByokSection(secondSession.firstWindow);
    await section.getByRole('button', { name: /^(Remove|移除)$/ }).click();
    await expect(section.getByLabel(/^(Model API endpoint|模型 API 端点)$/)).toHaveValue('');
    await expect(section.getByLabel(/^(Model name|模型名称)$/)).toHaveValue('');
    await expect(section.getByRole('button', { name: /^(Remove|移除)$/ })).toHaveCount(0);
    await expect(access(secretPath)).rejects.toThrow();
  } finally {
    await secondSession?.close();
  }
});
