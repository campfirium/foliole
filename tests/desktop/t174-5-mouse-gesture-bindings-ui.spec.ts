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
  await expect(cells).toHaveCount(16);
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
  const commandList = menu.locator('[data-mouse-gesture-command-list="true"]');
  await commandList.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => commandList.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  return menu;
}

async function recordGesture(page: Page, directions: Array<'left' | 'right' | 'up' | 'down'>) {
  const prompt = page.getByText('在此处按住右键拖动，录制手势。', { exact: true });
  const surface = prompt.locator('..');
  const box = await surface.boundingBox();
  if (!box) throw new Error('gesture recording surface has no geometry');
  let x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  for (const direction of directions) {
    if (direction === 'left') x -= 64;
    if (direction === 'right') x += 64;
    if (direction === 'up') y -= 64;
    if (direction === 'down') y += 64;
    await page.mouse.move(x, y, { steps: 4 });
  }
  await page.mouse.up({ button: 'right' });
}

test('shows two binding columns and one bounded localized command picker', async ({ desktopWindow }, testInfo) => {
  const dialog = await openChineseMouseGestureSettings(desktopWindow);
  const section = dialog.getByRole('region', { name: '鼠标手势绑定设置区' });
  await dialog.getByRole('button', { name: '手势外观' }).click();
  await expect(dialog.getByRole('switch', { name: '显示方向提示' })).not.toBeChecked();
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
  await dialog.getByRole('heading', { name: '手势动作' }).click();
  await expect(desktopWindow.getByLabel('筛选命令')).toHaveCount(0);
});

test('records two segments and confirms replacement of an assigned gesture', async ({ desktopWindow }, testInfo) => {
  const dialog = await openChineseMouseGestureSettings(desktopWindow);
  const search = dialog.getByRole('textbox', { name: '搜索命令' });

  await search.fill('打开设置');
  await dialog.getByRole('button', { name: '为打开设置录制手势' }).click();
  await recordGesture(desktopWindow, ['right', 'down']);
  await expect(desktopWindow.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  const recorder = desktopWindow.locator('[data-settings-nested-dialog="true"]');
  await attachScreenshot(recorder, testInfo, 't174-5-two-segment-recording');
  await desktopWindow.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.locator('[data-mouse-gesture-binding="right-down"] button')).toContainText('打开设置');

  await search.fill('命令面板');
  await dialog.getByRole('button', { name: '为命令面板录制手势' }).click();
  await recordGesture(desktopWindow, ['left']);
  await desktopWindow.getByRole('button', { name: '保存', exact: true }).click();
  await expect(desktopWindow.getByText('这个手势当前用于“后退”。点击“替换”更改绑定。')).toBeVisible();
  await attachScreenshot(recorder, testInfo, 't174-5-gesture-replacement-confirmation');
  await desktopWindow.getByRole('button', { name: '替换', exact: true }).click();
  await expect(dialog.locator('[data-mouse-gesture-binding="left"] button')).toContainText('命令面板');
});
