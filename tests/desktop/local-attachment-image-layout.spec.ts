import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';

const NODE_ID = 'local-attachment-image-layout';
const OTHER_ID = 'local-attachment-layout-other';
const ARTIFACT_DIR = path.resolve('.tmp/artifacts/local-attachment-image-layout');

async function expectLoadedLayout(page: Page) {
  const widget = page.locator(`[data-md-image-editor-node-id="${NODE_ID}"]`);
  await expect(widget).toHaveCount(1);
  await expect.poll(() => widget.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(2752);
  await expect(widget).toHaveAttribute('data-md-image-display', 'block');
  await expect(widget.locator('img')).toHaveClass(/cm-md-image-element-block/u);
  await expect(page.locator('.cm-content')).toContainText('Infographic caption');
}

test('shows a captioned local infographic as a large image after opening and reopening', async ({ desktopApp, desktopWindow }, testInfo) => {
  const bytesBase64 = await desktopApp.evaluate(({ nativeImage }) => {
    const source = nativeImage.createFromPath(`${process.cwd()}/assets/brand/foliole-leaf-tight.png`);
    return source.resize({ width: 2752, height: 1536 }).toPNG().toString('base64');
  });
  const hash = createHash('sha256').update(Buffer.from(bytesBase64, 'base64')).digest('hex');
  const content = `![Infographic](asset://${hash}.png)Infographic caption\n\nFollowing paragraph`;
  await desktopWindow.evaluate(async ({ nodeId, otherId, bytesBase64, content }) => {
    const debug = window.__folioleWorkspaceDebug;
    if (!debug?.seedNodes || !debug.importClipboardImageAttachment) throw new Error('Attachment helpers unavailable');
    await debug.seedNodes([
      { id: nodeId, kind: 'topic', title: 'Local infographic', content },
      { id: otherId, kind: 'topic', title: 'Other article', content: 'Other article body' }
    ], { persist: true });
    const imported = await debug.importClipboardImageAttachment({
      bytesBase64, mimeType: 'image/png', nodeId, originalName: 'infographic.png'
    });
    if (!imported) throw new Error('Attachment import failed');
    await debug.openNode?.(nodeId);
  }, { nodeId: NODE_ID, otherId: OTHER_ID, bytesBase64, content });

  await expectLoadedLayout(desktopWindow);
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await desktopWindow.screenshot({ path: path.join(ARTIFACT_DIR, 'first-open.png') });
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), OTHER_ID);
  await expect(desktopWindow.locator('.cm-content')).toContainText('Other article body');
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), NODE_ID);
  await expectLoadedLayout(desktopWindow);
  expect((await loadNodeDocument(desktopWindow, NODE_ID))?.content).toBe(content);
  const screenshot = path.join(ARTIFACT_DIR, 'reopened.png');
  await desktopWindow.screenshot({ path: screenshot });
  await testInfo.attach('reopened-local-infographic', { path: screenshot, contentType: 'image/png' });
});
