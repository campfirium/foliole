import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';

const SOURCE_IMAGE_PATH = path.resolve('assets/brand/foliole-leaf-tight.png');
const NODE_ID = 'local-image-delayed-attachment';

test('recovers when a local attachment arrives after its image is first rendered', async ({ desktopWindow }) => {
  const sourceBuffer = fs.readFileSync(SOURCE_IMAGE_PATH);
  const attachmentId = createHash('sha256').update(sourceBuffer).digest('hex');
  const sourceBytes = sourceBuffer.toString('base64');

  await desktopWindow.waitForFunction(() => Array.from(
    document.querySelectorAll<HTMLImageElement>('.cm-md-image-element')
  ).some((image) => image.complete && image.naturalWidth > 0));
  await desktopWindow.evaluate(async ({ attachmentId: id, nodeId, sourceBytes: bytes }) => {
    const debug = window.__folioleWorkspaceDebug;
    if (!debug?.seedNodes || !debug.openNode || !debug.importClipboardImageAttachment) {
      throw new Error('Workspace debug attachment helpers are unavailable');
    }
    await debug.seedNodes([{
      content: `![Delayed local image](asset://${id}.png)`,
      id: nodeId,
      kind: 'topic',
      title: 'Delayed local image'
    }]);
    const widgetReady = new Promise<void>((resolve) => {
      const selector = `[data-md-image-editor-node-id="${nodeId}"]`;
      const observer = new MutationObserver(() => {
        if (!document.querySelector(selector)) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    const openNode = debug.openNode(nodeId);
    await widgetReady;
    await debug.importClipboardImageAttachment({
      bytesBase64: bytes,
      mimeType: 'image/png',
      nodeId,
      originalName: 'delayed-local-image.png'
    });
    await openNode;
  }, { attachmentId, nodeId: NODE_ID, sourceBytes });

  await expect(desktopWindow.locator(`[data-md-image-editor-node-id="${NODE_ID}"]`)).toHaveCount(1);
  const image = desktopWindow.locator('.cm-md-image-element');
  await expect(image).toHaveCount(1);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(desktopWindow.locator('[data-md-image-status="unavailable"]')).toHaveCount(0);
});

test('leaving a pending local image and returning shows the recovered attachment', async ({ desktopWindow }, testInfo) => {
  const sourceBuffer = fs.readFileSync(SOURCE_IMAGE_PATH);
  const attachmentId = createHash('sha256').update(sourceBuffer).digest('hex');
  const pendingId = 'pending-image-navigation';
  const otherId = 'pending-image-other';
  await desktopWindow.evaluate(async ({ attachmentId: id, pendingId, otherId }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { content: `![Pending navigation image](asset://${id}.png)`, id: pendingId, kind: 'topic', title: 'Pending navigation image' },
      { content: 'Unrelated document remains readable.', id: otherId, kind: 'topic', title: 'Other navigation document' }
    ], { persist: true });
  }, { attachmentId, pendingId, otherId });
  await desktopWindow.getByRole('treeitem', { name: 'Pending navigation image', exact: true }).click();
  const widget = desktopWindow.locator(`[data-md-image-editor-node-id="${pendingId}"]`);
  await expect(widget).toHaveCount(1);
  expect(await widget.locator('img').evaluateAll((images: HTMLImageElement[]) =>
    images.every((image) => image.naturalWidth === 0))).toBe(true);
  await desktopWindow.getByRole('treeitem', { name: 'Other navigation document', exact: true }).click();
  await expect(widget).toHaveCount(0);
  await desktopWindow.evaluate(async ({ nodeId, bytes }) => {
    await window.__folioleWorkspaceDebug?.importClipboardImageAttachment?.({
      bytesBase64: bytes, mimeType: 'image/png', nodeId, originalName: 'pending-navigation.png'
    });
  }, { nodeId: pendingId, bytes: sourceBuffer.toString('base64') });
  await expect(desktopWindow.locator('.cm-content')).toContainText('Unrelated document remains readable.');
  await expect(desktopWindow.locator('[data-md-image-status="unavailable"]')).toHaveCount(0);
  await desktopWindow.getByRole('treeitem', { name: 'Pending navigation image', exact: true }).click();
  const image = widget.locator('img');
  await expect(image).toHaveCount(1);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(desktopWindow.locator('[data-md-image-status="unavailable"]')).toHaveCount(0);
  await desktopWindow.screenshot({ path: testInfo.outputPath('recovered-after-navigation.png') });
});
