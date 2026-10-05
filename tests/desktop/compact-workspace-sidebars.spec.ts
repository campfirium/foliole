import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const LEFT_TOGGLE = /^(Toggle left panel|切换左侧栏|切换左侧面板)$/;
const RIGHT_TOGGLE = /^(Toggle right sidebar|切换右侧栏)$/;

async function documentBounds(page: Page) {
  const bounds = await page.getByRole('region', { name: /^(Document and review area|文档和复习区域)$/ }).boundingBox();
  return bounds ? { width: bounds.width, x: bounds.x } : null;
}

async function prepareCompactWorkspace(desktopWindow: Page) {
  // macOS has no default right-sidebar shortcut; use an ordinary saved binding.
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-command-shortcut-overrides', JSON.stringify({
      'workspace.toggleRightSidebar': { primary: ']' }
    }));
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect(desktopWindow.getByRole('textbox', { name: 'Prompt editor', exact: true })).toBeVisible();
  await desktopWindow.setViewportSize({ width: 1000, height: 800 });
}

test('compact sidebars open temporarily through buttons and configured shortcuts without squeezing the document', async ({
  desktopWindow
}) => {
  await prepareCompactWorkspace(desktopWindow);
  const titlebar = desktopWindow.locator('.window-titlebar');
  const left = desktopWindow.locator('.workspace-floating-sidebar-left');
  const right = desktopWindow.locator('.workspace-floating-sidebar-right');
  await expect(left).toBeHidden();
  await expect(right).toBeHidden();
  const initialDocumentBounds = await documentBounds(desktopWindow);
  expect(initialDocumentBounds).not.toBeNull();

  await titlebar.getByRole('button', { name: LEFT_TOGGLE }).click();
  await expect(left).toBeVisible();
  await expect(right).toBeHidden();
  expect(await documentBounds(desktopWindow)).toEqual(initialDocumentBounds);
  await desktopWindow.screenshot({ path: '.tmp/artifacts/compact-workspace-left.png' });

  await titlebar.getByRole('button', { name: RIGHT_TOGGLE }).click();
  await expect(left).toBeHidden();
  await expect(right).toBeVisible();
  expect(await documentBounds(desktopWindow)).toEqual(initialDocumentBounds);
  await right.locator('button[data-panel-id="outline"]').click();
  await expect(right.locator('[data-panel-content-root="outline"]')).toBeVisible();
  await right.locator('button[data-panel-id="review-queue"]').click();
  await desktopWindow.screenshot({ path: '.tmp/artifacts/compact-workspace-right.png' });
  await desktopWindow.keyboard.press('Escape');
  await expect(right).toBeHidden();

  await titlebar.getByRole('button', { name: LEFT_TOGGLE }).focus();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+l' : '[');
  await expect(left).toBeVisible();
  const backdrop = desktopWindow.getByRole('button', { name: /^(Close sidebar|收起侧栏)$/ });
  const backdropBounds = await backdrop.boundingBox();
  if (!backdropBounds) throw new Error('temporary sidebar dismissal surface is missing');
  await backdrop.click({ position: { x: backdropBounds.width - 1, y: backdropBounds.height / 2 } });
  await expect(left).toBeHidden();
  await titlebar.getByRole('button', { name: RIGHT_TOGGLE }).focus();
  await desktopWindow.keyboard.press(']');
  await expect(right).toBeVisible();
  await desktopWindow.keyboard.press(']');
  await expect(right).toBeHidden();

  await desktopWindow.setViewportSize({ width: 1400, height: 800 });
  await expect(left).toHaveCount(0);
  await expect(right).toHaveCount(0);
  await desktopWindow.setViewportSize({ width: 1000, height: 800 });
  await expect(left).toBeHidden();
  await expect(right).toBeHidden();
});
