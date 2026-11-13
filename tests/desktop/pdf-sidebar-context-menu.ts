import type { Page } from '@playwright/test';

import { expect } from './harness/fixtures';

export async function expectSidebarContextMenu(page: Page) {
  const left = page.locator('.workspace-floating-sidebar-left');
  const pane = (await page.getByTestId('pdf-scroll-container').boundingBox())!;
  await page.mouse.move(80, pane.y + pane.height / 2);
  await expect(left).toBeVisible();
  await left.getByRole('treeitem').last().click({ button: 'right' });
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem').first().hover();
  await page.waitForTimeout(220);
  await expect(left).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  await expect(left).toBeHidden();
}
