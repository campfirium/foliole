import type { Page } from '@playwright/test';

import { createDefaultAideAttachedContextSettings } from '../../lib/core/assistant/aideAttachedContextSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

async function openAidePermissions(page: Page) {
  const general = await openSettingsCategory(page, 'General');
  await general.getByRole('region', { name: 'Foliole Aide' })
    .getByRole('button', { name: /^(Open|打开)$/ }).click();
  const dialog = page.getByRole('dialog', { name: /^(Aide settings|Aide 设置)$/ });
  await dialog.getByRole('button', { name: /^(AI permissions|AI 权限)$/ }).click();
  return dialog;
}

test('restores attached content while preserving permission changes', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openAidePermissions(desktopWindow);
  const budget = dialog.getByRole('spinbutton', { name: /^(Read limit per reply|每次回答的读取上限)/ });
  await expect(budget).toHaveValue('20000');
  await budget.fill('19000');
  await budget.press('Enter');
  await expect.poll(() => desktopWindow.evaluate(async () => {
    const permissions = await window.electronAPI?.invoke('assistant_load_tool_permissions');
    return permissions?.readBudget;
  })).toBe(19000);

  await desktopWindow.reload();
  await openAidePermissions(desktopWindow);
  await expect(budget).toHaveValue('19000');
  await expect(dialog.getByRole('button', { name: /^(Restore defaults|恢复默认)$/ })).toHaveCount(0);
  await testInfo.attach('aide-permissions', {
    body: await dialog.screenshot(),
    contentType: 'image/png'
  });

  await dialog.getByRole('button', { name: /^(Attached content|附带内容)$/ }).click();
  const contextBudget = dialog.getByRole('spinbutton', { name: /^(Total budget|总额度)/ });
  const reset = dialog.getByRole('button', { name: /^(Restore attached content defaults|恢复附带内容默认设置)$/ });
  await expect(reset).toBeDisabled();
  await contextBudget.fill('1800');
  await contextBudget.blur();
  await dialog.getByRole('switch', { name: /^(Attach Path and membership|附带路径与归属)$/ }).click();
  const readAttachedContent = () => desktopWindow.evaluate(() =>
    window.electronAPI?.invoke('assistant_load_attached_context_settings')
  );
  await expect.poll(async () => (await readAttachedContent())?.totalBudget).toBe(1800);
  await expect(reset).toBeEnabled();
  const screenshot = testInfo.outputPath('aide-attached-content.png');
  await dialog.screenshot({ path: screenshot });
  await testInfo.attach('aide-attached-content', { contentType: 'image/png', path: screenshot });
  await reset.click();
  await expect(contextBudget).toHaveValue('2100');
  await expect(reset).toBeDisabled();
  await expect.poll(readAttachedContent).toEqual(createDefaultAideAttachedContextSettings());
  await dialog.getByRole('button', { name: /^(AI permissions|AI 权限)$/ }).click();
  await expect(budget).toHaveValue('19000');
  await expect(reset).toHaveCount(0);
});
