import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, getSettingsDialog } from './harness/settings';

test('shows native shortcut symbols and opens the matching Hotkeys row', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'en');
    window.localStorage.setItem('foliole-settings-active-category', 'about');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const ribbon = desktopWindow.getByRole('region', { name: 'Left toolbar' });
  await ribbon.getByRole('button', { name: 'Command Palette' }).click();
  const commandDialog = desktopWindow.getByRole('dialog', { name: 'Command palette' });
  await expect(commandDialog).toBeVisible();

  const configureShortcut = commandDialog.getByRole('button', {
    name: 'Configure shortcut for Create Folder'
  });
  await expect(configureShortcut).toHaveText('⇧ ⌘ N');
  await configureShortcut.click();

  await expect(commandDialog).toBeHidden();
  const settingsDialog = getSettingsDialog(desktopWindow);
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: 'Hotkeys', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(settingsDialog.getByRole('searchbox', { name: 'Search hotkeys' })).toHaveValue('Create Folder');
  const shortcut = settingsDialog.getByRole('button', { name: 'Shortcut for Create Folder', exact: true });
  await expect(shortcut).toHaveText('⇧ ⌘ N');
  await expect(shortcut).toBeFocused();
  await expect.poll(() => desktopWindow.evaluate(() =>
    window.localStorage.getItem('foliole-settings-active-category')
  )).toBe('about');

  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/command-palette-shortcut-configuration.png');
  await settingsDialog.screenshot({ path: screenshotPath });
  await testInfo.attach('command-palette-shortcut-configuration', { path: screenshotPath });

  await desktopWindow.keyboard.press('Escape');
  await expect(settingsDialog).toBeHidden();
  await ribbon.getByRole('button', { name: 'Settings' }).click();
  await expect(settingsDialog.getByRole('button', { name: 'About', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );
});

test('shows full localized setting and tip copy in search results', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'zh-Hans'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  await desktopWindow.getByRole('button', { name: '命令面板', exact: true }).click();
  const palette = desktopWindow.getByRole('dialog', { name: '命令面板' });
  const search = palette.getByRole('textbox', { name: '搜索命令' });
  await search.fill('导入');
  await expect(palette.getByRole('button', { name: '导入文件', exact: true })).toBeVisible();
  await expect(palette.getByRole('button', { name: '允许导入学习进度', exact: true })).toHaveAccessibleDescription(/./);
  const settingsImage = await palette.screenshot({ path: '.tmp/artifacts/command-palette-settings-results.png' });
  await testInfo.attach('command-palette-settings-results', { body: settingsImage, contentType: 'image/png' });

  await search.fill('relearn');
  await expect(palette.getByText('重新学习', { exact: true })).toBeVisible();
  await expect(palette.getByText('清除此主题的学习进度。之后可以从头再次学习。不影响派生材料。')).toBeVisible();
  const tipsImage = await palette.screenshot({ path: '.tmp/artifacts/command-palette-action-tip.png' });
  await testInfo.attach('command-palette-action-tip', { body: tipsImage, contentType: 'image/png' });
});
