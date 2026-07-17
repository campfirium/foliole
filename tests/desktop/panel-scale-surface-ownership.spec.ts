import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('right sidebar keeps slot geometry outside the active panel scale surface', async ({
  desktopWindow
}) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-workspace-right-sidebar-width', '340');
    localStorage.setItem('foliole-content-region-scales', JSON.stringify({ 'right-panel:assistant': 130 }));
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await openAssistantPanel(desktopWindow);

  const slot = desktopWindow.locator('.workspace-region-main-sidebar');
  const surface = desktopWindow.locator('[data-panel-scale-id="right-panel:assistant"]');
  const toolbar = desktopWindow.getByRole('button', { name: /^(History|历史)$/ }).locator('xpath=ancestor::header');
  await expect(slot).not.toHaveAttribute('data-panel-scale-id');
  await expect(surface).toHaveCount(1);
  await expect(surface.locator(toolbar)).toHaveCount(1);

  const [slotBounds, toolbarBounds] = await Promise.all([slot.boundingBox(), toolbar.boundingBox()]);
  expect(slotBounds).not.toBeNull();
  expect(toolbarBounds).not.toBeNull();
  const slotRight = (slotBounds?.x ?? 0) + (slotBounds?.width ?? 0);
  const toolbarRight = (toolbarBounds?.x ?? 0) + (toolbarBounds?.width ?? 0);
  expect(Math.abs(slotRight - toolbarRight)).toBeLessThanOrEqual(2);
});

async function openAssistantPanel(page: Page) {
  const directButton = page.getByRole('button', { name: /Foliole Aide.*panel|Foliole Aide面板/ });
  const moreButton = page.getByRole('button', { name: /^(More right sidebar panels|更多右侧栏面板)$/ });
  await expect(directButton.first().or(moreButton)).toBeVisible();
  if (await directButton.count()) {
    await directButton.first().click();
    return;
  }
  await moreButton.click();
  await page.getByRole('menuitem', { name: /Foliole Aide/ }).click();
}
