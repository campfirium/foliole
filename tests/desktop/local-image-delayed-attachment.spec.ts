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
    document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block')
  ).some((image) => image.complete && image.naturalWidth > 0));
  await desktopWindow.evaluate(async ({ attachmentId: id, nodeId }) => {
    const debug = window.__folioleWorkspaceDebug;
    await debug?.seedNodes?.([{
      content: `![Delayed local image](asset://${id}.png)`,
      id: nodeId,
      kind: 'topic',
      title: 'Delayed local image'
    }]);
    await debug?.openNode?.(nodeId);
  }, { attachmentId, nodeId: NODE_ID });

  const image = desktopWindow.locator('.cm-md-image-element-block');
  await expect(image).toHaveCount(1);
  await desktopWindow.evaluate(async ({ nodeId, sourceBytes: bytes }) => {
    await window.__folioleWorkspaceDebug?.importClipboardImageAttachment?.({
      bytesBase64: bytes,
      mimeType: 'image/png',
      nodeId,
      originalName: 'delayed-local-image.png'
    });
  }, { nodeId: NODE_ID, sourceBytes });

  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(desktopWindow.locator('[data-md-image-status="unavailable"]')).toHaveCount(0);
});
