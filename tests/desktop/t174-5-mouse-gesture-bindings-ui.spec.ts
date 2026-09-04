import path from 'node:path';

import type { Locator, Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const ARTIFACT_DIR = path.join(process.cwd(), '.tmp/artifacts');

async function openChineseMouseGestureSettings(page: Page) {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'zh-Hans'));
  await page.reload();
  await expectWorkspaceShell(page);
  const dialog = await openSettingsDialog(page);
  await dialog.getByRole('button', { name: '鼠标手势', exact: true }).click();
  return dialog;
}

async function expectTwoBindingColumns(section: Locator) {
  const cells = section.locator('[data-mouse-gesture-binding]');
  await expect(cells).toHaveCount(12);
  const [first, second, third] = await Promise.all([
    cells.nth(0).boundingBox(),
    cells.nth(1).boundingBox(),
    cells.nth(2).boundingBox()
  ]);
  if (!first || !second || !third) throw new Error('gesture binding cells have no geometry');
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width * 0.8);
  expect(third.y).toBeGreaterThan(first.y + first.height * 0.8);
}

async function attachScreenshot(locator: Locator, testInfo: TestInfo, name: string) {
  const screenshotPath = path.join(ARTIFACT_DIR, `${name}.png`);
  await locator.screenshot({ path: screenshotPath });
  await testInfo.attach(name, { path: screenshotPath });
}

async function expectBoundedPicker(page: Page, section: Locator) {
  const sectionHeight = await section.evaluate((node) => node.getBoundingClientRect().height);
  await section.locator('[data-mouse-gesture-binding="up"]').getByRole('button').click();
  const menu = page.getByRole('menu', { name: '为上选择命令' });
  await expect(menu).toBeVisible();
  await expect(page.getByLabel('筛选命令')).toBeFocused();
  const box = await menu.boundingBox();
  if (!box) throw new Error('gesture command picker has no geometry');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('desktop viewport is unavailable');
  expect(box.width).toBeLessThan(500);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await expect.poll(() => section.evaluate((node) => node.getBoundingClientRect().height)).toBe(sectionHeight);
  await expect(menu.getByText('后退', { exact: true })).toBeVisible();
  await expect(menu.getByText('Go Back', { exact: true })).toHaveCount(0);
  await expect(menu.getByText('Undo', { exact: true })).toHaveCount(0);
  return menu;
}

test('shows two binding columns and one bounded localized command picker', async ({ desktopWindow }, testInfo) => {
  const dialog = await openChineseMouseGestureSettings(desktopWindow);
  const section = dialog.getByRole('region', { name: '鼠标手势绑定设置区' });
  await expectTwoBindingColumns(section);
  await attachScreenshot(dialog, testInfo, 't174-5-mouse-gesture-bindings-two-column');

  const menu = await expectBoundedPicker(desktopWindow, section);
  await attachScreenshot(desktopWindow.locator('body'), testInfo, 't174-5-mouse-gesture-picker-open');
  await desktopWindow.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  const last = section.locator('[data-mouse-gesture-binding]').last();
  await last.scrollIntoViewIfNeeded();
  await last.getByRole('button').click();
  await expect(desktopWindow.getByLabel('筛选命令')).toHaveCount(1);
  await dialog.getByRole('heading', { name: '绑定' }).click();
  await expect(desktopWindow.getByLabel('筛选命令')).toHaveCount(0);
});
