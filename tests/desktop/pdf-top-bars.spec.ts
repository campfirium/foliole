import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { verifyFlatPdfBars, verifyScrollRevealsOnlyToolbar, verifyUpperSideReveal } from './pdf-top-bars-behavior';
import { revealPdfBars } from './pdf-top-bars-interaction';

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
  await page.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
  await page.getByRole('menuitem', { name: '100%', exact: true }).click();
  await expect.poll(() => page.getByTestId('pdf-scroll-container').evaluate((container) => {
    const paper = container.querySelector('.pdf-document-page-frame')?.getBoundingClientRect();
    return Boolean(paper && paper.width > 0 && paper.width < container.clientWidth);
  })).toBe(true);
  await expect(page.getByTestId('pdf-document-page-shell').first()).toHaveAttribute(
    'data-pdf-page-state',
    'ready'
  );
  await revealToolbar(page);
  return nodeId;
}

async function revealToolbar(page: Page) {
  await revealPdfBars(page);
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
  await revealPdfBars(page);
  await expect(title).toHaveAttribute('data-visible', 'true');
  await expect(navigation).toHaveAttribute('data-visible', 'true');
  expect(await scroll.evaluate((element) => element.clientHeight)).toBe(floatingHeight);
  await screenshot(page, 'revealed');
  await verifyFlatPdfBars(page);
  await verifyScrollRevealsOnlyToolbar(page);
  await verifyUpperSideReveal(page);
  await transferToPdfToolbar(page);
  await dismissFromReading(page);
  await revealToolbar(page);
  await verifyTopTextSelection(desktopApp, page);
  await revealToolbar(page);
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

async function dismissFromReading(page: Page) {
  const frame = page.getByTestId('pdf-document-page-frame').first();
  await frame.click({ position: { x: 20, y: 250 } });
  await expect(page.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'false', { timeout: 1000 });
  await expect(page.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false', { timeout: 1000 });
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'false', { timeout: 1000 });
  await screenshot(page, 'click-dismissed');
}

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
  await revealPdfBars(page);
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

async function transferToPdfToolbar(page: Page) {
  const title = page.getByTestId('pdf-window-top-bar');
  const navigation = page.getByTestId('pdf-document-top-bar');
  const toolbar = page.getByTestId('pdf-document-toolbar');
  const gap = page.getByTestId('pdf-toolbar-transfer-zone');
  const originalTop = await toolbar.evaluate((element) => element.getBoundingClientRect().top);
  await navigation.hover();
  await gap.hover();
  await page.waitForTimeout(1000);
  await expect(title).toHaveAttribute('data-visible', 'true');
  await page.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).hover();
  await page.waitForTimeout(3300);
  await expect(title).toHaveAttribute('data-visible', 'true');
  await expect(navigation).toHaveAttribute('data-visible', 'true');
  await expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  expect(await toolbar.evaluate((element) => element.getBoundingClientRect().top)).toBe(originalTop);
  const divider = await title.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return { content: style.content, height: style.height, opacity: Number(style.opacity) };
  });
  expect(divider.content).toBe('""');
  expect(divider.height).toBe('1px');
  expect(divider.opacity).toBeGreaterThan(0);
  await screenshot(page, 'linked-toolbar');
}

async function verifyTopTextSelection(app: ElectronApplication, page: Page) {
  const scroll = page.getByTestId('pdf-scroll-container');
  await scroll.evaluate((container) => {
    const text = container.querySelector('.textLayer span');
    if (!text) throw new Error('PDF text unavailable');
    container.scrollTop += text.getBoundingClientRect().top - container.getBoundingClientRect().top - 6;
  });
  await moveToReading(page);
  const title = page.getByTestId('pdf-window-top-bar');
  await expect(title).toHaveAttribute('data-visible', 'false');
  const dragRegion = title.locator('.window-titlebar-drag-fill');
  expect(await dragRegion.evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('no-drag');
  expect(await page.locator('.window-titlebar').evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('no-drag');
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds());
  const text = page.locator('.textLayer span').first();
  const box = await text.boundingBox();
  if (!box) throw new Error('PDF text bounds unavailable');
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await expect(title).toHaveAttribute('data-visible', 'false');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim())).not.toBe('');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds())).toEqual(bounds);
  await screenshot(page, 'top-text-selection');
  const highlight = page.getByRole('button', { name: /^(Highlight|高亮)$/ });
  await expect(highlight).toBeVisible();
  await highlight.click();
  await expect(page.getByTestId('pdf-highlight-rect').first()).toBeVisible();
  await screenshot(page, 'top-text-highlight');
  await scroll.click({ position: { x: 80, y: 220 } });
  await revealPdfBars(page, 'right');
  await expect(title).toHaveAttribute('data-visible', 'true');
  expect(await dragRegion.evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region'))).toBe('drag');
}
