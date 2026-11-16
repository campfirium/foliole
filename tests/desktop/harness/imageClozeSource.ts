import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import type { WorkspaceRuntimeNodeDocument } from '../../../src/shared/platform/workspaceRuntimeTypes';

import { expect } from './fixtures';

export const OWNER_ID = 'hidden-native-image-source';

export async function seedImageSource(page: Page, imageCount = 1) {
  const bytes = fs.readFileSync(path.resolve('assets/brand/foliole-leaf-tight.png'));
  const hash = createHash('sha256').update(bytes).digest('hex');
  await page.evaluate(async ({ hash, bytesBase64, ownerId, imageCount }) => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([{ id: ownerId, kind: 'topic', title: 'Image input isolation',
      content: Array.from({ length: imageCount }, () => `![Original image](asset://${hash}.png)`).join('\n\n') }], { persist: true });
    await debug.importClipboardImageAttachment!({ bytesBase64, mimeType: 'image/png',
      nodeId: ownerId, originalName: 'original.png' });
    await debug.openNode(ownerId);
  }, { ownerId: OWNER_ID, hash, bytesBase64: bytes.toString('base64'), imageCount });
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .some((image) => image.complete && image.naturalWidth > 0));
}

export async function dragImageCloze(page: Page, useUnusedCorner = false) {
  const surface = page.locator('.cm-md-image-surface-block').first();
  await surface.hover();
  await expect(surface.locator('.cm-md-image-cloze-overlay')).toBeVisible();
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('Expected source image');
  const [startX, startY, endX, endY] = useUnusedCorner ? [0.78, 0.1, 0.94, 0.3] : [0.2, 0.35, 0.7, 0.75];
  await page.mouse.move(bounds.x + bounds.width * startX!, bounds.y + bounds.height * startY!);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * endX!, bounds.y + bounds.height * endY!, { steps: 8 });
  await page.mouse.up();
}

export async function clozeIds(page: Page) {
  return page.evaluate(ownerId => window.__folioleWorkspaceDebug!.listNodes()
    .map(({ id }) => window.__folioleWorkspaceDebug!.getNode(id))
    .filter(node => node?.parentNodeId === ownerId && node.anchorKind === 'cloze')
    .map(node => node!.id), OWNER_ID);
}

export async function openSource(page: Page) {
  await page.evaluate(ownerId => window.__folioleWorkspaceDebug!.openNode(ownerId), OWNER_ID);
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .some(image => image.complete && image.naturalWidth > 0));
}

export async function readDocument(page: Page, nodeId: string) {
  return page.evaluate(id => window.electronAPI!.invoke('load_node_document', { nodeId: id }), nodeId) as Promise<WorkspaceRuntimeNodeDocument>;
}
