import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const APPEARANCE_ACTION = /^(Appearance mode: (Light|Dark|Follow system \(currently (Light|Dark)\))|外观模式：(浅色|深色|跟随系统（当前为(浅色|深色)）))$/;
const APPEARANCE_MANAGER_LABEL = /^(Cycle Appearance Mode|循环切换外观模式)$/;
const CUSTOMIZATION_SCREENSHOT = path.resolve('.tmp/artifacts/desktop-acceptance/workspace-appearance-customization.png');

async function readBaseColor(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.dataset.baseColor);
}

async function readResolvedBaseColor(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.dataset.resolvedBaseColor as 'dark' | 'light');
}

test('keeps the three-state appearance action inside left toolbar customization', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.getByRole('button', { name: /^(Settings|设置)$/ }).click();

  const settingsDialog = desktopWindow.getByRole('dialog').filter({
    has: desktopWindow.getByRole('button', { name: /^(Left toolbar|左侧工具栏)$/ })
  });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('button', { name: /^(Left toolbar|左侧工具栏)$/ }).click();
  const managerLabel = settingsDialog.getByText(APPEARANCE_MANAGER_LABEL);
  await expect(managerLabel).toBeVisible();
  await managerLabel.scrollIntoViewIfNeeded();
  await desktopWindow.screenshot({ fullPage: true, path: CUSTOMIZATION_SCREENSHOT });
  await desktopWindow.keyboard.press('Escape');
  await expect(settingsDialog).toBeHidden();

  const rail = desktopWindow.getByRole('region', { name: /^(Left toolbar|左侧工具栏)$/ });
  const action = rail.getByRole('button', { name: APPEARANCE_ACTION });
  const initialResolvedMode = await readResolvedBaseColor(desktopWindow);
  const oppositeMode = initialResolvedMode === 'light' ? 'dark' : 'light';

  await action.click();
  await expect.poll(() => readBaseColor(desktopWindow)).toBe(oppositeMode);
  await action.click();
  await expect.poll(() => readBaseColor(desktopWindow)).toBe('system');
  await expect(action.locator('[data-appearance-indicator="system"]')).toBeVisible();
  await expect(action.locator(`[data-appearance-indicator="${initialResolvedMode}"]`)).toBeVisible({ timeout: 3_000 });
  expect(await readBaseColor(desktopWindow)).toBe('system');

  await action.click();
  await expect.poll(() => readBaseColor(desktopWindow)).toBe(oppositeMode);
  await action.click();
  await expect.poll(() => readBaseColor(desktopWindow)).toBe('system');
  await action.click();
  await expect.poll(() => readBaseColor(desktopWindow)).toBe(initialResolvedMode);
  await testInfo.attach('workspace-appearance-rail-action', {
    body: await rail.screenshot(),
    contentType: 'image/png'
  });
});
