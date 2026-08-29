import { expect } from '@playwright/test';

import { test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

test('filters hotkeys by localized command titles', async ({ desktopWindow }) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'zh-Hans');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const dialog = await openSettingsCategory(desktopWindow, 'Hotkeys');
  await dialog.getByRole('searchbox', { name: '搜索快捷键' }).fill('面板');

  await expect(dialog.getByText('命令面板', { exact: true })).toBeVisible();
  await expect(dialog.getByText('打开设置', { exact: true })).toHaveCount(0);
});
