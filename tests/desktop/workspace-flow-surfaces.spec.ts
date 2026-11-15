import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const enterFlow = /^(Enter Flow|进入 Flow)$/;
const exitFlow = /^(Exit Flow|退出 Flow)$/;
const footerSelector = '.workspace-bottom-region-grid';

async function prepareWorkspace(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('foliole-app-language', 'en');
    localStorage.setItem('foliole-base-color', 'light');
    localStorage.setItem('foliole-workspace-list-width', '300');
    localStorage.setItem('foliole-workspace-dual-list-width', '420');
    localStorage.setItem('foliole-workspace-list-collapsed', 'false');
    localStorage.setItem('foliole-workspace-surface-palette', JSON.stringify(['#fedcba', '#abcdef']));
    localStorage.setItem('foliole-workspace-surface-assignments', JSON.stringify({
      'main-folder': 0, 'main-topic': 1, 'footer-folder': 1, 'footer-topic': 0
    }));
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.reload();
  await expectWorkspaceShell(page);
}

async function leftEdgeSegments(page: Page) {
  return page.evaluate((footerClass) => {
    const footer = document.querySelector(footerClass)!.getBoundingClientRect();
    const pane = document.querySelector('[data-workspace-document-focus-target]')!.getBoundingClientRect();
    const root = document.querySelector('.workspace-responsive-shell')!;
    return Array.from(root.querySelectorAll('div[aria-hidden="true"]')).map((element) => {
      const bounds = element.getBoundingClientRect();
      return { bounds, color: getComputedStyle(element).backgroundColor };
    }).filter(({ bounds, color }) => bounds.width === 1 && bounds.height > 10 &&
      Math.abs(pane.left - bounds.right) <= 1 && color !== 'rgba(0, 0, 0, 0)')
      .map(({ bounds, color }) => ({
        atMain: Math.abs(bounds.bottom - footer.top) <= 1,
        atFooter: Math.abs(bounds.top - footer.top) <= 1,
        color
      }));
  }, footerSelector);
}

test('Flow follows the effective folder boundary and restores its own surface after reopening', async ({ desktopWindow: page }, testInfo) => {
  await prepareWorkspace(page);
  const exit = page.getByRole('button', { name: exitFlow });
  if (await exit.isVisible()) await exit.click();
  const toggle = page.locator('[data-workspace-sidebar-toggle="left"]');
  const documentArea = page.locator('[data-workspace-document-focus-target]');
  const footer = page.locator(footerSelector);
  const folderSurface = footer.locator('[data-workspace-surface-column="folder"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const browseHeight = (await documentArea.boundingBox())!.height;
  await page.getByRole('button', { name: enterFlow }).click();
  await expect(exit).toBeVisible();
  await expect.poll(async () => (await folderSurface.boundingBox())?.width ?? 0).toBe(0);

  const session = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(folderSurface).toHaveCSS('background-color', 'rgb(171, 205, 239)');
  await expect.poll(async () => {
    const lines = await leftEdgeSegments(page);
    const main = lines.find((line) => line.atMain);
    const bottom = lines.find((line) => line.atFooter);
    return Boolean(main && bottom && main.color !== bottom.color);
  }).toBe(true);
  const splitter = page.locator('[data-workspace-folder-splitter]');
  await expect.poll(async () => {
    const [main, bottom] = await Promise.all([splitter.boundingBox(), folderSurface.boundingBox()]);
    return Math.abs(main!.x - bottom!.x - bottom!.width);
  }).toBeLessThanOrEqual(1);

  const resize = page.getByRole('separator', { name: 'Resize topic list' });
  const handle = (await resize.boundingBox())!;
  const initialWidth = (await folderSurface.boundingBox())!.width;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + handle.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await folderSurface.boundingBox())!.width).toBeLessThan(initialWidth);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: testInfo.outputPath('flow-left-docked.png') });

  await toggle.click();
  await expect.poll(async () => (await folderSurface.boundingBox())?.width ?? 0).toBe(0);
  expect(await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession())).toEqual(session);
  await page.screenshot({ path: testInfo.outputPath('flow-left-collapsed.png') });
  await exit.click();
  await expect(footer).toBeHidden();
  await expect.poll(async () => (await documentArea.boundingBox())!.height).toBe(browseHeight);
  await toggle.click();
  await page.getByRole('button', { name: enterFlow }).click();
  await expect(folderSurface).toHaveCSS('background-color', 'rgb(171, 205, 239)');
});

test('uses the saved workspace surface assignment when the Flow footer returns', async ({ desktopWindow: page }) => {
  await prepareWorkspace(page);
  const exit = page.getByRole('button', { name: exitFlow });
  if (await exit.isVisible()) await exit.click();
  const dialog = await openSettingsCategory(page, 'Appearance');
  await dialog.getByRole('button', { name: 'Palette color 1', exact: true }).click();
  const bottomFolder = dialog.getByRole('button', { name: 'Bottom folder', exact: true });
  await bottomFolder.click();
  await expect(bottomFolder).toHaveCSS('background-color', 'rgb(254, 220, 186)');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.reload();
  await expectWorkspaceShell(page);
  if (!(await exit.isVisible())) await page.getByRole('button', { name: enterFlow }).click();
  const footer = page.locator(footerSelector);
  await expect(footer.locator('[data-workspace-surface-column="folder"]'))
    .toHaveCSS('background-color', 'rgb(254, 220, 186)');
  await expect(footer.locator('[data-workspace-surface-divider="folder"]')).toBeHidden();
});
