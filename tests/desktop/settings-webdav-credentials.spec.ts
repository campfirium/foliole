import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';
import { createT178ApiAcceptanceSession } from './harness/t178ApiAcceptanceSession';

async function openWebDavSettings(page: Page, createGroup = false) {
  await expectWorkspaceShell(page);
  const settings = await openSettingsDialog(page);
  if (createGroup) {
    await settings.getByRole('button', { name: /^(Sync \(LAN\)|同步（局域网）)$/ }).click();
    await settings.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ }).click();
    await expect(settings.getByRole('list', { name: /^(Devices|设备)$/ })).toBeVisible();
  }
  await settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ }).click();
  return settings;
}

async function readSavedCiphertext(app: ElectronApplication, stateRoot: string) {
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  const relative = path.relative(stateRoot, userData);
  expect(relative.startsWith('..') || path.isAbsolute(relative)).toBe(false);
  const directory = path.join(userData, 'config', 'webdav-credentials');
  const files = await readdir(directory);
  expect(files).toHaveLength(1);
  const file = path.join(directory, files[0]!);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  return readFile(file);
}

async function saveAndRejectReplacement(page: Page, url: string, password: string, readCiphertext: () => Promise<Buffer>) {
  const settings = await openWebDavSettings(page, true);
  const folder = settings.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ });
  const username = settings.getByRole('textbox', { name: /^(Username|用户名)$/ });
  const secret = settings.getByLabel(/^(App password|应用密码)$/);
  const save = settings.getByRole('button', { name: /^(Test and save credentials|测试并保存凭据)$/ });

  await folder.fill(url);
  await username.fill('foliole-test-mac');
  await secret.fill(password);
  await save.click();
  await expect(settings.getByText(/WebDAV credentials saved securely on this Mac|WebDAV 凭据已安全保存在此 Mac/)).toBeVisible();
  await expect(secret).toHaveValue('');
  await expect(settings.getByText(/^(Service not configured|服务未配置)$/)).toBeVisible();
  const saved = await readCiphertext();
  expect(saved.includes(password)).toBe(false);
  expect(saved.includes('foliole-test-mac')).toBe(false);

  await secret.fill('wrong-password');
  await save.click();
  await expect(settings.getByText(/Could not verify or save WebDAV credentials|无法验证或保存 WebDAV 凭据/)).toBeVisible();
  await expect(secret).toHaveValue('');
  expect((await readCiphertext()).equals(saved)).toBe(true);
}

async function expectRestoredCredentials(stateRoot: string, url: string, testInfo: TestInfo) {
  const reopened = await createT178ApiAcceptanceSession(stateRoot);
  try {
    const restored = await openWebDavSettings(reopened.firstWindow);
    await expect(restored.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ })).toHaveValue(url);
    await expect(restored.getByText(/Credentials saved on this Mac for|已在此 Mac 保存/)).toBeVisible();
    await expect(restored.getByLabel(/^(App password|应用密码)$/)).toHaveValue('');
    await testInfo.attach('webdav-credential-result', { body: await restored.screenshot(), contentType: 'image/png' });
  } finally {
    await reopened.close();
  }
}

test('keeps encrypted WebDAV credentials across relaunch and a failed replacement', async ({ browserName }, testInfo) => {
  void browserName;
  const url = process.env.FOLIOLE_TEST_AUTHENTICATED_WEBDAV_URL;
  const password = process.env.FOLIOLE_TEST_AUTHENTICATED_WEBDAV_PASSWORD;
  // SKIP: requires a macOS Internal renderer and a dedicated HTTPS DAV sandbox | 2026-11-11 | revive: authenticated sandbox is provisioned by the native lane
  test.skip(process.platform !== 'darwin' || !url || !password, 'Requires an isolated authenticated DAV sandbox.');
  if (!url || !password) throw new Error('Test DAV sandbox is unavailable.');

  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-webdav-credentials-'));
  try {
    const first = await createT178ApiAcceptanceSession(stateRoot);
    try {
      await saveAndRejectReplacement(first.firstWindow, url, password,
        () => readSavedCiphertext(first.electronApp, stateRoot));
    } finally {
      await first.close();
    }
    await expectRestoredCredentials(stateRoot, url, testInfo);
  } finally {
    await rm(stateRoot, { force: true, recursive: true });
  }
});
