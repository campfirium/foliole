import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

async function openPdf(app: ElectronApplication, page: Page) {
  await page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ }).click();
  await app.evaluate(({ dialog }, fixture) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
  }, path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf'));
  const nodeId = await page.evaluate(async () => {
    const result = await window.electronAPI?.invoke('run_text_file_import', {});
    if (!result || typeof result !== 'object' || typeof result.node_id !== 'string')
      throw new Error('PDF import failed');
    return result.node_id;
  });
  await expect
    .poll(() => page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.id, nodeId))
    .toBe(nodeId);
  await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId);
  await page.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();
  await expect(page.getByTestId('pdf-document-page-shell').first()).toHaveAttribute(
    'data-pdf-page-state',
    'ready'
  );
  await revealToolbar(page);
  await page.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
  await page.getByRole('menuitem', { name: '100%', exact: true }).click();
  return nodeId;
}

async function revealToolbar(page: Page) {
  await page.getByTestId('pdf-toolbar-reveal-zone').hover();
  await expect(page.getByTestId('pdf-document-toolbar')).toHaveAttribute(
    'data-toolbar-visible',
    'true'
  );
}

async function moveToReading(page: Page) {
  await page.getByTestId('pdf-scroll-container').click({ position: { x: 80, y: 220 } });
  await page.mouse.move(20, 200);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-top-bars/${name}.png`) });
}

test('PDF top bars @pdf float, protect navigation, restore space, and remember the document choice', async ({
  desktopApp,
  desktopWindow: page
}) => {
  const nodeId = await openPdf(desktopApp, page);
  const title = page.getByTestId('pdf-window-top-bar');
  const navigation = page.getByTestId('pdf-document-top-bar');
  const scroll = page.getByTestId('pdf-scroll-container');
  const toggle = page.getByRole('button', { name: /Auto-hide top bars|自动隐藏顶部栏/ });
  await revealToolbar(page);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const otherRegions = await measureOtherRegions(page);
  const floatingHeight = await scroll.evaluate((element) => element.clientHeight);
  await moveToReading(page);
  await expect(title).toHaveAttribute('data-visible', 'false');
  await expect(navigation).toHaveAttribute('data-visible', 'false');
  await screenshot(page, 'hidden');
  await page.getByTestId('pdf-top-bars-reveal-zone').hover();
  await expect(title).toHaveAttribute('data-visible', 'true');
  await expect(navigation).toHaveAttribute('data-visible', 'true');
  expect(await scroll.evaluate((element) => element.clientHeight)).toBe(floatingHeight);
  await screenshot(page, 'revealed');
  await protectNavigationMenu(page);
  await verifyFixedSideControls(page);
  await revealToolbar(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(title).toHaveAttribute('data-floating', 'false');
  expect(await scroll.evaluate((element) => element.clientHeight)).toBeLessThan(floatingHeight);
  expect(await measureOtherRegions(page)).toEqual(otherRegions);
  await screenshot(page, 'disabled');
  await page.reload();
  await expect(page.locator(`[role="treeitem"][data-node-id="${nodeId}"]`)).toBeVisible();
  await page.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();
  await revealToolbar(page);
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await moveToReading(page);
  await expect(title).toHaveAttribute('data-visible', 'false');
  await expect(page.getByTestId('pdf-document-toolbar')).toHaveAttribute(
    'data-toolbar-visible',
    'false'
  );
});

async function protectNavigationMenu(page: Page) {
  const button = page.getByRole('button', { name: /More editor options|更多编辑器选项/ });
  await button.click();
  await page.mouse.move(20, 200);
  await page.waitForTimeout(3300);
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'true');
  await screenshot(page, 'navigation-menu');
  await page.getByRole('menu').press('Escape');
  await expect(button).toBeFocused();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'true');
  await moveToReading(page);
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'false');
}

async function measureOtherRegions(page: Page) {
  const regions = [
    page.getByRole('region', { name: /Left toolbar|左侧工具栏/ }),
    page.getByRole('complementary', { name: /Current folder content|当前文件夹内容/ }),
    page.locator('.workspace-region-main-sidebar')
  ];
  return Promise.all(regions.map(async (region) => {
    const box = await region.boundingBox();
    if (!box) throw new Error('A workspace side region is unavailable');
    return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value)]));
  }));
}

async function verifyFixedSideControls(page: Page) {
  const toggle = page.getByRole('button', { name: /Toggle right sidebar|切换右侧栏/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('pdf-toolbar-reveal-zone').hover();
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}
