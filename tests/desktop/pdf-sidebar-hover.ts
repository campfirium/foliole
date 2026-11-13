import type { Page } from '@playwright/test';

import { expect } from './harness/fixtures';

export async function expectEdgeHover(page: Page) {
  const scroller = page.getByTestId('pdf-scroll-container');
  const bounds = await scroller.boundingBox();
  if (!bounds) throw new Error('PDF viewport unavailable');
  const y = bounds.y + bounds.height / 2;
  const right = page.locator('.workspace-floating-sidebar-right');
  const left = page.locator('.workspace-floating-sidebar-left');
  const width = await page.evaluate(() => window.innerWidth);
  const edge = width * 0.94;
  const center = width / 2;

  await page.mouse.move(center, y);
  await page.mouse.down();
  await page.mouse.move(edge, y);
  await page.waitForTimeout(350);
  await expect(right).toBeHidden();
  await page.mouse.up();
  await page.mouse.move(center, y);
  await page.mouse.move(edge, y);
  await page.mouse.wheel(80, 0);
  await page.waitForTimeout(350);
  await expect(right).toBeHidden();
  await page.mouse.move(center, y);
  await page.mouse.move(edge, y);
  await expect(right).toBeVisible();
  await expect(right).toHaveCSS('box-shadow', 'none');
  await expect(scroller).toBeVisible();
  await expect(page.locator('.window-titlebar [data-workspace-surface-column="sidebar"]')).toBeVisible();
  await page.mouse.move(edge - 30, y);
  await expect(right).toBeVisible();
  await page.mouse.move(bounds.x + bounds.width / 2, y);
  await expect(right).toBeHidden();

  await page.mouse.move(width * 0.06, y);
  await expect(left).toBeVisible();
  await expect(left).toHaveCSS('box-shadow', 'none');
  await expect(scroller).toBeVisible();
  await expect(page.locator('.window-titlebar [data-workspace-surface-column="folder"]')).toBeVisible();
  expect(await scroller.boundingBox()).toEqual(bounds);
  await page.keyboard.press('Escape');
  await expect(left).toBeHidden();
  await expect(scroller).toBeVisible();
}

export async function expectRightTitlebarControlsAligned(page: Page) {
  const rightToggle = (await page.locator('.window-titlebar [data-workspace-sidebar-toggle="right"]').boundingBox())!;
  const header = (await page.locator('.window-titlebar').boundingBox())!;
  expect(header.x + header.width - rightToggle.x - rightToggle.width).toBeLessThan(rightToggle.width);
  const actions = (await page.locator('.window-titlebar-right-panel-actions').boundingBox())!;
  expect(actions.x + actions.width).toBeLessThanOrEqual(rightToggle.x + 1);
}
