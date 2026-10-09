import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { revealPdfBars } from './pdf-top-bars-interaction';

test('PDF toolbar @pdf idles, reveals, and protects focused controls and menus', async ({ desktopApp, desktopWindow }) => {
  await desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ }).click();
  await desktopApp.evaluate(({ dialog }, fixture) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
  }, path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf'));
  const nodeId = await desktopWindow.evaluate(async () => {
    const result = await window.electronAPI?.invoke('run_text_file_import', {});
    if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') throw new Error('PDF import failed');
    return result.node_id;
  });
  await expect.poll(() => desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.id, nodeId)).toBe(nodeId);
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId);
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();
  await desktopWindow.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
  await desktopWindow.getByRole('menuitem', { name: '100%', exact: true }).click();
  await expect.poll(() => desktopWindow.getByTestId('pdf-scroll-container').evaluate((container) => {
    const paper = container.querySelector('.pdf-document-page-frame')?.getBoundingClientRect();
    return Boolean(paper && paper.width > 0 && paper.width < container.clientWidth);
  })).toBe(true);
  const scroll = desktopWindow.getByTestId('pdf-scroll-container');
  const toolbar = desktopWindow.getByTestId('pdf-document-toolbar');
  await expect(desktopWindow.getByTestId('pdf-document-page-shell').first()).toHaveAttribute('data-pdf-page-state', 'ready');
  await desktopWindow.mouse.move(20, 200);
  await scroll.evaluate((element) => { element.scrollTop = 300; });
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(200);
  await scroll.evaluate((element) => { element.scrollTop = 400; });
  await expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  await scroll.evaluate((element) => { element.scrollTop = 300; });
  await expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  await expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false', { timeout: 5000 });
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/pdf-toolbar-idle/hidden.png') });
  await revealPdfBars(desktopWindow);
  await expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  const pageInput = desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await pageInput.click();
  await desktopWindow.mouse.move(20, 200);
  await desktopWindow.waitForTimeout(3300);
  await expect(pageInput).toBeFocused();
  await expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  await pageInput.fill('2');
  await pageInput.press('Enter');
  await expect(pageInput).toHaveValue('2');
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/pdf-toolbar-idle/focused.png') });
  await pageInput.press('Tab');
  await desktopWindow.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
  await desktopWindow.mouse.move(20, 200);
  await desktopWindow.waitForTimeout(3300);
  await expect(desktopWindow.getByRole('menu')).toBeVisible();
  await expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/pdf-toolbar-idle/menu.png') });
  await desktopWindow.getByRole('menuitem', { name: '125%' }).click();
  await scroll.click({ position: { x: 80, y: 200 } });
  await desktopWindow.mouse.move(20, 200);
  await expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false', { timeout: 5000 });
});
