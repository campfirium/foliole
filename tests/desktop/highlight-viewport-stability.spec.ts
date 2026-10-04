import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { Page } from '@playwright/test';

import { focusEditor, undoShortcut } from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-highlight-viewport-stability';
const IMAGE_PATH = path.resolve('assets/brand/foliole-leaf-tight.png');
const ARTIFACT_DIR = path.resolve('.tmp/artifacts/highlight-viewport-stability');

async function seedImageDocument(desktopWindow: Page) {
  const bytes = await fs.readFile(IMAGE_PATH);
  const imageHash = createHash('sha256').update(bytes).digest('hex');
  const target = 'Viewport stability target text';
  const lines = Array.from({ length: 110 }, (_, index) => `Paragraph ${index + 1} keeps the document scrollable.`);
  lines.splice(65, 0, `![Cover](asset://${imageHash}.png)`);
  lines.splice(70, 0, `This paragraph contains ${target} for highlighting.`);
  const content = lines.join('\n\n');
  await desktopWindow.evaluate(async ({ bytesBase64, content, nodeId }) => {
    const debug = window.__folioleWorkspaceDebug;
    if (!debug?.seedNodes || !debug.importClipboardImageAttachment || !debug.openNode) {
      throw new Error('Workspace fixture entry is unavailable');
    }
    await debug.seedNodes([{ content, id: nodeId, kind: 'topic', title: 'Highlight viewport stability' }], { persist: true });
    const imported = await debug.importClipboardImageAttachment({
      bytesBase64,
      mimeType: 'image/png',
      nodeId,
      originalName: 'cover.png'
    });
    if (!imported) throw new Error('Image fixture import failed');
    if (!await debug.openNode(nodeId)) throw new Error('Seeded document did not open');
  }, { bytesBase64: bytes.toString('base64'), content, nodeId: NODE_ID });
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(NODE_ID);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(content);
  return { content, target };
}

test('keeps the reading position and image while highlighting text and undoing it', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  const { content, target } = await seedImageDocument(desktopWindow);
  const image = desktopWindow.locator('.prompt-editor-host .cm-md-image-element').first();
  const from = content.indexOf(target);
  expect(from).toBeGreaterThan(0);
  await desktopWindow.evaluate(({ from, to }) => {
    const debug = window.__folioleDebug;
    if (!debug?.setEditorSelection?.('prompt-editor', from, to)) throw new Error('Editor selection unavailable');
    const scroller = document.querySelector<HTMLElement>('.prompt-editor-host .cm-scroller');
    if (!scroller) throw new Error('Editor scroller unavailable');
    const target = debug.getEditorPositionViewportTop?.('prompt-editor', from);
    if (target == null) throw new Error('Target position unavailable');
    const viewport = scroller.getBoundingClientRect();
    scroller.scrollTop += target - viewport.top - viewport.height * 0.55;
  }, { from, to: from + target.length });
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(image).toBeVisible();
  const baselineMetrics = await desktopWindow.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.prompt-editor-host .cm-scroller');
    const image = document.querySelector<HTMLElement>('.prompt-editor-host .cm-md-image-element');
    if (!scroller || !image) throw new Error('Editor image unavailable');
    image.dataset.viewportStabilityImage = 'original';
    return { clientHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight, scrollTop: scroller.scrollTop };
  });
  expect(baselineMetrics.scrollTop, JSON.stringify(baselineMetrics)).toBeGreaterThan(0);
  const baseline = baselineMetrics.scrollTop;

  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await expect(palette).toBeVisible();
  await palette.locator('button[aria-label="Highlight Selection"], button[aria-label="高亮所选内容"]').click();
  await expect(palette).toBeHidden();
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-highlight')).toHaveCount(1);
  await expect.poll(async () => desktopWindow.evaluate((initialScrollTop) => {
    const scroller = document.querySelector<HTMLElement>('.prompt-editor-host .cm-scroller');
    return Math.abs((scroller?.scrollTop ?? 0) - initialScrollTop);
  }, baseline)).toBeLessThanOrEqual(2);
  await expect(image).toHaveAttribute('data-viewport-stability-image', 'original');

  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const screenshot = path.join(ARTIFACT_DIR, 'after-highlight.png');
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('after-highlight', { path: screenshot, contentType: 'image/png' });

  await focusEditor(desktopWindow);
  await desktopWindow.keyboard.press(undoShortcut());
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-highlight')).toHaveCount(0);
  await expect.poll(async () => desktopWindow.evaluate((initialScrollTop) => {
    const scroller = document.querySelector<HTMLElement>('.prompt-editor-host .cm-scroller');
    return Math.abs((scroller?.scrollTop ?? 0) - initialScrollTop);
  }, baseline)).toBeLessThanOrEqual(2);
  await expect(image).toHaveAttribute('data-viewport-stability-image', 'original');
});
