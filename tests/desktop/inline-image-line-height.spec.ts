import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';

test('keeps inline images one line high as reading font size changes', async ({ desktopApp, desktopWindow }, testInfo) => {
  const bytesBase64 = await desktopApp.evaluate(({ nativeImage }) => {
    const source = nativeImage.createFromPath(`${process.cwd()}/assets/brand/foliole-leaf-tight.png`);
    return source.resize({ width: 24, height: 24 }).toPNG().toString('base64');
  });
  const hash = createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex');
  const nodeId = 'inline-image-line-height';
  const content = `Text ![Inline](asset://${hash}.png) tail`;
  await desktopWindow.evaluate(async ({ nodeId, content, bytesBase64 }) => {
    const debug = window.__folioleWorkspaceDebug;
    if (!debug?.seedNodes || !debug.importClipboardImageAttachment) throw new Error('Attachment helpers unavailable');
    await debug.seedNodes([{ id: nodeId, kind: 'topic', title: 'Inline image', content }], { persist: true });
    const imported = await debug.importClipboardImageAttachment({
      bytesBase64, mimeType: 'image/png', nodeId, originalName: 'inline.png'
    });
    if (!imported) throw new Error('Attachment import failed');
    await debug.openNode?.(nodeId);
  }, { nodeId, content, bytesBase64 });

  const widget = desktopWindow.locator(`[data-md-image-editor-node-id="${nodeId}"]`);
  await expect(widget).toHaveAttribute('data-md-image-display', 'inline');
  await expect(widget.locator('img')).toBeVisible();
  for (const fontSize of [20, 28]) {
    const geometry = await widget.evaluate((element, size) => {
      (element as HTMLElement).style.fontSize = `${size}px`;
      const style = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, lineHeight: Number.parseFloat(style.lineHeight) };
    }, fontSize);
    expect(geometry.lineHeight).toBe(fontSize);
    expect(geometry.height).toBeCloseTo(geometry.lineHeight, 1);
  }
  await widget.locator('.cm-md-image-surface').hover();
  await expect(widget.locator('.cm-md-image-resize-handle')).toBeHidden();
  await widget.locator('.cm-md-image-preview-trigger').click();
  const dialog = desktopWindow.getByRole('dialog');
  const preview = dialog.getByRole('img', { name: 'Inline' });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(24);
  await dialog.getByRole('button').click();
  await expect(dialog).toHaveCount(0);
  expect((await loadNodeDocument(desktopWindow, nodeId))?.content).toBe(content);
  const screenshot = path.resolve('.tmp/artifacts/T680/inline-image-line-height.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('inline-image-line-height', { path: screenshot, contentType: 'image/png' });
});
