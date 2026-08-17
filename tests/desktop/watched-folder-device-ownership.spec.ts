import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { Page } from '@playwright/test';

import { createReadwiseImportSources } from '../../lib/core/import/importManagerSettings';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const IMPORT_HEADING = /^(Watched folders|监听文件夹)$/;
const originalFolder = (id: string) => new RegExp(`^(Original folder|原文文件夹) ${id}$`);
const disableKeep = (id: string) => new RegExp(`^(Disable keep import|停用持续导入) ${id}$`);
const ACTIVE_ELSEWHERE = /^(Readwise is running on Windows PC\.|Readwise 正在 Windows PC 上运行。)$/;
const ACTIVE_HERE = /^(Readwise is running on this device\.|Readwise 正在此设备上运行。)$/;
const USE_THIS_DEVICE = /^(Use this device|使用此设备)$/;

async function seedOwnedWatchedFolders(databasePath: string, identityPath: string) {
  const identity = JSON.parse(await fs.readFile(identityPath, 'utf8')) as {
    deviceName: string; installationId: string; platform: string;
  };
  const db = new DatabaseSync(databasePath);
  const now = '2026-08-17T00:00:00.000Z';
  db.prepare(`INSERT INTO source_ownership_cutover (singleton_id, status, cutover_at)
    VALUES (1, 'cutover', ?)
    ON CONFLICT(singleton_id) DO UPDATE SET status = 'cutover', cutover_at = excluded.cutover_at`).run(now);
  const insert = db.prepare(`INSERT INTO watched_folder_bindings (
    binding_id, owner_installation_id, owner_device_name, owner_platform,
    action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
    enabled, availability, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, 'keep', '', 'merged', '', NULL, ?, 1, 'available', ?, ?, NULL)`);
  insert.run('local-watched', identity.installationId, identity.deviceName, identity.platform,
    '/Users/local/Inbox', now, now);
  insert.run('remote-watched', 'desktop-windows', 'Windows PC', 'win32',
    'D:\\Inbox', now, now);
  db.close();
}

async function seedReadwiseDeviceSettings(databasePath: string, libraryHome: string) {
  const readwiseRoot = path.join(libraryHome, 'Readwise-local-only');
  const sources = createReadwiseImportSources(readwiseRoot).map((source) => ({
    ...source, keepState: 'enabled' as const
  }));
  await Promise.all(sources.flatMap((source) => [source.primaryPath, source.highlightPath])
    .filter(Boolean).map((directory) => fs.mkdir(directory, { recursive: true })));
  const db = new DatabaseSync(databasePath);
  const now = '2026-08-17T00:00:00.000Z';
  const save = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  save.run('readwise_device_settings', JSON.stringify({
    confirmedAt: now,
    readwiseReaderConfig: { ...createDefaultReadwiseReaderConfig(), enabled: true },
    readwiseRootPath: readwiseRoot,
    readwiseSources: sources,
    version: 4
  }), now);
  save.run('readwise_active_installation', JSON.stringify({
    deviceName: 'Windows PC', installationId: 'desktop-windows', platform: 'win32'
  }), now);
  db.prepare(`INSERT INTO setting_records (
    key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at, deleted_at
  ) VALUES ('readwise_device_settings', 'device', 'windows', 'desktop', 'remote-device', ?, 'remote', ?, NULL)`)
    .run(JSON.stringify({ readwiseRootPath: 'D:\\Private\\Readwise-remote-secret' }), now);
  db.close();
  return readwiseRoot;
}

async function invokeReadwiseImport(page: Page) {
  try {
    return await page.evaluate(async () =>
      globalThis.window?.electronAPI?.invoke('run_readwise_reader_import', {}));
  } catch (error) {
    return String(error);
  }
}

test('groups watched folders by owner and keeps remote controls read only', async ({
  desktopSession
}, testInfo) => {
  let restartedSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    const libraryHome = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
    if (!libraryHome) throw new Error('missing isolated library home');
    const userData = await desktopSession.electronApp.evaluate(({ app }) => app.getPath('userData'));
    await desktopSession.electronApp.close();
    await seedOwnedWatchedFolders(
      path.join(libraryHome, 'Data', 'foliole.db'),
      path.join(userData, 'desktop-installation.json')
    );
    const readwiseRoot = await seedReadwiseDeviceSettings(path.join(libraryHome, 'Data', 'foliole.db'), libraryHome);
    restartedSession = await launchDesktopSession({ env: desktopSession.launchOptions.env });
    const desktopPage = restartedSession.firstWindow;
    await expectWorkspaceShell(desktopPage);
    const settingsDialog = await openSettingsCategory(desktopPage, 'Import');

    await expect(settingsDialog.getByRole('heading', { level: 2, name: IMPORT_HEADING })).toBeVisible();
    await expect(settingsDialog.getByRole('row', { name: 'Windows PC' })).toBeVisible();
    const remoteFolder = settingsDialog.getByRole('button', { name: originalFolder('remote-watched') });
    await expect(remoteFolder).toContainText('Inbox');
    await expect(remoteFolder).toBeDisabled();
    await expect(settingsDialog.getByRole('button', { name: disableKeep('remote-watched') })).toBeDisabled();
    await expect(settingsDialog.getByRole('button', { name: originalFolder('local-watched') })).toBeEnabled();
    await expect(settingsDialog.getByRole('button', { name: disableKeep('local-watched') })).toBeEnabled();
    await expect(settingsDialog.getByRole('status')).toHaveCount(0);

    const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
      'watched-folder-device-ownership-hidden-native.png');
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await settingsDialog.screenshot({ path: screenshotPath });
    await testInfo.attach('watched-folder-device-ownership', { path: screenshotPath, contentType: 'image/png' });

    const readwiseDialog = await openSettingsCategory(desktopPage, 'Readwise Reader');
    await expect(readwiseDialog.getByText(ACTIVE_ELSEWHERE)).toBeVisible();
    await expect(readwiseDialog).toContainText(path.basename(readwiseRoot));
    await expect(readwiseDialog).not.toContainText('Readwise-remote-secret');
    const standbyResult = await invokeReadwiseImport(desktopPage);
    expect(standbyResult).toContain('readwise_not_active_on_this_device');

    await readwiseDialog.getByRole('button', { name: USE_THIS_DEVICE }).click();
    await expect(readwiseDialog.getByText(ACTIVE_HERE)).toBeVisible();
    await expect.poll(() => desktopPage.evaluate(async () => {
      const settings = await globalThis.window?.electronAPI?.invoke('load_import_manager_settings', {});
      return settings?.readwiseActiveInstallationId === settings?.readwiseCurrentInstallationId;
    })).toBe(true);
    const activeResult = await invokeReadwiseImport(desktopPage);
    expect(activeResult).toMatchObject({ status: 'completed' });
    const readwiseScreenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'desktop-acceptance',
      'readwise-device-selection-hidden-native.png');
    await readwiseDialog.screenshot({ path: readwiseScreenshotPath });
    await testInfo.attach('readwise-device-selection', { path: readwiseScreenshotPath, contentType: 'image/png' });
  } finally {
    await restartedSession?.close();
  }
});
