import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance');
const WATCHED_PATH = path.join(process.cwd(), '.tmp/artifacts/t135-watched-source');

test('keeps watched and Readwise source connections explicit in desktop settings', async ({ desktopWindow }, testInfo) => {
  await mkdir(WATCHED_PATH, { recursive: true });
  const settings = createDefaultImportManagerSettings();
  settings.sources[0] = {
    ...settings.sources[0]!,
    id: 't135-watched-source',
    keepState: 'enabled',
    primaryPath: WATCHED_PATH
  };
  await desktopWindow.evaluate(async (nextSettings) => {
    await globalThis.window?.electronAPI?.invoke('save_import_manager_settings', { settings: nextSettings });
  }, settings);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const importDialog = await openSettingsCategory(desktopWindow, 'Import');
  const watchedRegion = importDialog.getByRole('region', {
    name: /^(Watched folders in this workgroup|工作组中的监听文件夹)$/
  });
  await expect(watchedRegion).toBeVisible();
  await expect(watchedRegion.getByRole('button', { name: /^(Disconnect|断开)$/ })).toBeVisible();
  await watchedRegion.getByRole('button', { name: /^(Disconnect|断开)$/ }).click();
  await expect(watchedRegion.getByRole('button', { name: /^(Reconnect|重新连接)$/ })).toBeVisible();
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const watchedScreenshot = path.join(ARTIFACT_DIR, 't135-watched-source-connections.png');
  await importDialog.screenshot({ path: watchedScreenshot });
  await testInfo.attach('t135-watched-source-connections', { path: watchedScreenshot, contentType: 'image/png' });

  const readwiseDialog = await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  const deviceRegion = readwiseDialog.getByRole('region', { name: /^(Readwise device|Readwise 设备)$/ });
  await expect(deviceRegion).toBeVisible();
  const useThisDevice = deviceRegion.getByRole('button', { name: /^(Use this device|使用此设备)$/ });
  await expect(useThisDevice).toBeVisible();
  await useThisDevice.click();
  await expect(useThisDevice).toHaveCount(0);
  const readwiseScreenshot = path.join(ARTIFACT_DIR, 't135-readwise-device-assignment.png');
  await readwiseDialog.screenshot({ path: readwiseScreenshot });
  await testInfo.attach('t135-readwise-device-assignment', { path: readwiseScreenshot, contentType: 'image/png' });
});
