import path from 'node:path';
import process from 'node:process';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { createVisualPdfFixture, importPdf } from './pdf-image-excerpt-test-support';
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/pdf-image-excerpt-text-visible.png');
const ANNOTATED_SCREENSHOT_PATH = path.resolve('.tmp/artifacts/pdf-annotated-image-excerpt-visible.png');

async function dragExcerptRegion(desktopWindow: Page, area = { endX: 0.7, endY: 0.75, startX: 0.2, startY: 0.35 }) {
  const page = desktopWindow.locator('.pdf-visual-excerpt-page').first();
  const bounds = await page.boundingBox();
  if (!bounds) throw new Error('PDF page has no bounds');
  await desktopWindow.mouse.move(bounds.x + bounds.width * area.startX, bounds.y + bounds.height * area.startY);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(bounds.x + bounds.width * area.endX, bounds.y + bounds.height * area.endY);
  await desktopWindow.mouse.up();
}

async function selectExcerptOutline(desktopWindow: Page, nodeId?: string) {
  const outline = nodeId
    ? desktopWindow.locator(`[data-pdf-image-excerpt-node-id="${nodeId}"]`).first()
    : desktopWindow.getByTestId('pdf-image-excerpt-outline').first();
  const bounds = await outline.boundingBox();
  if (!bounds) throw new Error('PDF image excerpt outline has no bounds');
  await desktopWindow.mouse.click(bounds.x + 1, bounds.y + bounds.height / 2);
  const toolbar = desktopWindow.locator('[data-annotation-toolbar="true"]');
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('button', { name: /^(Add Comment|添加批注)$/ })).toBeVisible();
}

async function requestPdfAnnotationFromPalette(desktopWindow: Page) {
  const ribbon = desktopWindow.getByRole('region', { name: /Left toolbar|左侧工具栏/ });
  await ribbon.getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('annotation');
  await palette.locator('button[aria-label="Annotate Selection"], button[aria-label="批注所选内容"]').click();
}

test('PDF annotation command @pdf creates one annotated image excerpt after a visual selection', async ({
  desktopApp,
  desktopWindow
}) => {
  const fixturePath = path.resolve('.tmp/artifacts/pdf-annotated-image-excerpt.pdf');
  createVisualPdfFixture(fixturePath, null);
  const parentNodeId = await importPdf(desktopApp, desktopWindow, fixturePath);

  await requestPdfAnnotationFromPalette(desktopWindow);
  await dragExcerptRegion(desktopWindow);
  const noteInput = desktopWindow.getByRole('textbox', { name: /Add a comment|添加批注/ });
  await expect(noteInput).toBeVisible();
  await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 1/ })).toHaveCount(0);
  await noteInput.fill('Diagram thought');
  await desktopWindow.screenshot({ path: ANNOTATED_SCREENSHOT_PATH });
  await desktopWindow.getByRole('button', { name: /Save|保存/, exact: true }).click();

  const excerptNode = desktopWindow.getByRole('treeitem', { name: /Excerpt 1/ });
  await expect(excerptNode).toBeVisible();
  const excerptNodeId = await excerptNode.getAttribute('data-node-id');
  if (!excerptNodeId) throw new Error('Annotated PDF image excerpt node has no id');
  await expect(desktopWindow.locator(`[data-pdf-image-excerpt-node-id="${excerptNodeId}"]`)).toBeVisible();
  await expect.poll(() => desktopWindow.evaluate((nodeId) => (
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.content ?? null
  ), excerptNodeId)).toMatch(/asset:\/\/[^)]+\.png\)\n※ Diagram thought$/);

  await desktopWindow.reload();
  await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), parentNodeId);
  await expect(desktopWindow.locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]').first()).toBeVisible();
  await expect(desktopWindow.locator(`[data-pdf-image-excerpt-node-id="${excerptNodeId}"]`)).toBeVisible();
  await selectExcerptOutline(desktopWindow, excerptNodeId);
  await desktopWindow.locator('[data-annotation-toolbar="true"]')
    .getByRole('button', { name: /^(Add Comment|添加批注)$/ }).click();
  await expect(desktopWindow.getByRole('textbox', { name: /Add a comment|添加批注/ })).toHaveValue('Diagram thought');
});

test('PDF image excerpt @pdf creates a normal image and opens it from the source outline', async ({
  desktopApp,
  desktopWindow
}) => {
  const fixturePath = path.resolve('.tmp/artifacts/pdf-image-excerpt-sequential.pdf');
  createVisualPdfFixture(fixturePath, null);
  const parentNodeId = await importPdf(desktopApp, desktopWindow, fixturePath);
  await desktopWindow.getByRole('button', { name: /Region excerpt|区域摘录/ }).click();
  await dragExcerptRegion(desktopWindow);
  const excerptNode = desktopWindow.getByRole('treeitem', { name: /Excerpt 1/ });
  await expect(excerptNode).toBeVisible();
  const excerptNodeId = await excerptNode.getAttribute('data-node-id');
  if (!excerptNodeId) throw new Error('PDF image excerpt node has no id');
  await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline').first()).toBeVisible();
  await dragExcerptRegion(desktopWindow, { endX: 0.92, endY: 0.7, startX: 0.76, startY: 0.45 });
  await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 2/ })).toBeVisible();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 2/ })).toHaveCount(0);
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z');
  await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 2/ })).toBeVisible();
  await selectExcerptOutline(desktopWindow, excerptNodeId);
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await desktopWindow.locator('[data-annotation-toolbar="true"]')
    .getByRole('button', { name: /^(Open|打开)$/ }).click();
  await expect.poll(() => desktopWindow.evaluate(() => {
    const debug = window.__folioleWorkspaceDebug;
    const activeNodeId = debug?.getActiveNodeId?.() ?? null;
    return activeNodeId ? debug?.getNode?.(activeNodeId)?.anchorKind ?? null : null;
  })).toBe('image-excerpt');
  await expect(desktopWindow.locator('img[src^="foliole-asset://attachment/"]').first()).toBeVisible();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await expect(palette).toBeVisible();
  await palette.locator('button[aria-label="Go Up"], button[aria-label="返回上级"]').click();
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe(parentNodeId);
  await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline').first()).toBeVisible();
  await desktopWindow.reload();
  await expect.poll(() => desktopWindow.evaluate((nodeId) => (
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.anchorKind ?? null
  ), excerptNodeId)).toBe('image-excerpt');
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${parentNodeId}"]`).click();
  await expect(desktopWindow.locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]').first()).toBeVisible();
  const restoredOutline = desktopWindow.locator(`[data-pdf-image-excerpt-node-id="${excerptNodeId}"]`).first();
  await expect(restoredOutline).toBeVisible();
  await selectExcerptOutline(desktopWindow, excerptNodeId);
  await desktopWindow.locator('[data-annotation-toolbar="true"]')
    .getByRole('button', { name: /^(Close highlight|关闭高亮)$/ }).click();
  await expect(restoredOutline).toHaveCount(0);
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  await expect(restoredOutline).toBeVisible();
});
