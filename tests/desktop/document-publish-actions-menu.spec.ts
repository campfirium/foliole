import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, getSettingsDialog, openSettingsCategory } from './harness/settings';

const SCREENSHOT_PATH = path.resolve(
  '.tmp/artifacts/desktop-acceptance/document-publish-actions-menu.png'
);

test('exposes Topic publishing commands from the document actions menu', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const initialSettingsDialog = await openSettingsCategory(desktopWindow, 'TopicMenu');
  await initialSettingsDialog.getByRole('button', {
    name: /^(Restore default Topic menu|恢复默认主题菜单)$/
  }).click();
  await desktopWindow.keyboard.press('Escape');
  await expect(initialSettingsDialog).toBeHidden();

  const trigger = desktopWindow.getByRole('button', { name: /^(More editor options|更多编辑器选项)$/ });
  await expect(trigger).toBeVisible();
  await trigger.click();

  await expect(desktopWindow.getByRole('menuitem', { name: 'Publish to the site' })).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: 'Publish to WordPress' })).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: 'Publish to Discourse' })).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: /^(Switch to Source mode|切换到源码模式)$/ })).toBeVisible();
  await desktopWindow.getByRole('menuitem', { name: /^(Customize menu\.\.\.|自定义菜单\.\.\.)$/ }).click();

  const settingsDialog = getSettingsDialog(desktopWindow);
  await expect(settingsDialog.getByRole('heading', { level: 2, name: /^(Topic menu|主题菜单)$/ })).toBeVisible();
  await settingsDialog.getByRole('button', {
    name: /^(Show separator after Publish to the site|显示 Publish to the site 后的分割线)$/
  }).click();
  await settingsDialog.getByRole('switch', { name: /^(Show Publish to WordPress|显示 Publish to WordPress)$/ }).click();
  await settingsDialog.getByRole('switch', { name: /^(Show Customize menu\.\.\.|显示 自定义菜单\.\.\.)$/ }).click();
  await desktopWindow.keyboard.press('Escape');
  await expect(settingsDialog).toBeHidden();

  await trigger.click();
  const actionsMenu = desktopWindow.getByRole('menu', { name: /^(More editor options|更多编辑器选项)$/ });
  await expect(desktopWindow.getByRole('menuitem', { name: 'Publish to the site' })).toBeVisible();
  await expect(actionsMenu.getByRole('separator')).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: 'Publish to WordPress' })).toHaveCount(0);
  await expect(desktopWindow.getByRole('menuitem', { name: 'Publish to Discourse' })).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: /^(Switch to Source mode|切换到源码模式)$/ })).toBeVisible();
  await expect(desktopWindow.getByRole('menuitem', { name: /^(Customize menu\.\.\.|自定义菜单\.\.\.)$/ })).toHaveCount(0);

  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('document-publish-actions-menu', { contentType: 'image/png', path: SCREENSHOT_PATH });

  await desktopWindow.getByRole('menuitem', { name: 'Publish to the site' }).click();
  await expect(desktopWindow.getByRole('dialog', { name: 'Publish to the site' })).toBeVisible();
});
