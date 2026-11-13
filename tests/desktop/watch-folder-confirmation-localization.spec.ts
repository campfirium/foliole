import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

test('shows the watch folder trash confirmation in Simplified Chinese', async ({ desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  const folder = testInfo.outputPath('watch-folder');
  await mkdir(folder, { recursive: true });
  const settings = createDefaultImportManagerSettings();
  settings.sources[0] = { ...settings.sources[0]!, id: 'locale-watch', primaryPath: folder, actionMode: 'keep' };
  await page.evaluate(async (nextSettings) => {
    localStorage.setItem('foliole-app-language', 'zh-Hans');
    await window.electronAPI!.invoke('save_import_manager_settings', { settings: nextSettings });
  }, settings);
  await page.reload();
  await expectWorkspaceShell(page);

  const settingsDialog = await openSettingsCategory(page, 'Import');
  const handling = settingsDialog.getByRole('combobox', { name: '处理方式 locale-watch' });
  await handling.selectOption('delete');
  const confirmation = page.getByRole('dialog', { name: '启用导入后移入废纸篓？' });
  await expect(confirmation.getByText('监控文件夹中的源文件将在成功导入后移入系统废纸篓。')).toBeVisible();
  await expect(confirmation.getByRole('button', { name: '启用' })).toBeVisible();
  const artifact = path.resolve('.tmp/artifacts/watch-folder-confirmation-zh-Hans.png');
  await confirmation.screenshot({ path: artifact });
  await confirmation.getByRole('button', { name: '取消' }).click();
  await expect(handling).toHaveValue('keep');
});
