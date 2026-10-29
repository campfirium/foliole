import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { focusWorkspace } from './harness/contextualContentHistory';
import { clickNativeHistoryCommand } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const parentId = 'history-image-parent';
const childId = 'history-image-child';

async function seedParent(page: Page) {
  const bytes = fs.readFileSync('assets/brand/foliole-leaf-tight.png');
  const attachmentId = createHash('sha256').update(bytes).digest('hex');
  const content = `# Retained image source\n\n![Leaf](asset://${attachmentId}.png)`;
  await page.evaluate(async ({ attachmentId, bytesBase64, childId, content, parentId }) => {
    const api = window.__folioleWorkspaceDebug!;
    const locator = { attachmentId, x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
    await api.seedNodes([
      { id: parentId, kind: 'topic', title: 'Retained image source', content, reveal: 'Retained parent answer',
        imageRegions: [{ attachmentId, regions: [{ id: 'region', x: 0.2, y: 0.2, width: 0.5, height: 0.5 }] }] },
      { id: childId, parentNodeId: parentId, kind: 'item', title: 'Image item', content: 'Image question',
        reveal: 'Child answer', anchorLink: { id: 'region', kind: 'cloze', locator } }
    ]);
    await api.importClipboardImageAttachment({ bytesBase64, mimeType: 'image/png', nodeId: parentId, originalName: 'leaf.png' });
    await api.openNode(parentId);
  }, { attachmentId, bytesBase64: bytes.toString('base64'), childId, content, parentId });
  return content;
}

async function readParent(page: Page) {
  return page.evaluate(async ({ childId, parentId }) => {
    const parent = await window.electronAPI.invoke('load_node_document', { nodeId: parentId }) as {
      content: string; reveal: string | null; imageRegions: Array<{ regions: Array<{ id: string }> }> | null
    };
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return { content: parent.content, reveal: parent.reveal,
      regions: parent.imageRegions?.flatMap(group => group.regions.map(region => region.id)) ?? [],
      trashed: snapshot?.trashedNodeIds.includes(childId) };
  }, { childId, parentId });
}

test('restores parent image facts through delete history without replacing its body or answer', async ({
  desktopApp, desktopWindow: page
}) => {
  await expectWorkspaceShell(page);
  const content = await seedParent(page);
  const restored = { content, reveal: 'Retained parent answer', regions: ['region'], trashed: false };
  const deleted = { ...restored, regions: [], trashed: true };
  await expect.poll(() => readParent(page)).toEqual(restored);
  await expect(page.locator('.cm-md-image-cloze-region')).toHaveCount(1);
  expect(await page.evaluate(id => window.__folioleWorkspaceDebug!.deleteNode(id), childId)).toBe(true);
  await expect.poll(() => readParent(page)).toEqual(deleted);
  for (const mode of ['undo', 'redo', 'undo'] as const) {
    await focusWorkspace(page);
    await clickNativeHistoryCommand(desktopApp, page, mode === 'undo' ? 'app.undo' : 'app.redo');
    await expect.poll(() => readParent(page)).toEqual(mode === 'undo' ? restored : deleted);
  }
  await expect(page.locator('.cm-md-image-cloze-region')).toHaveCount(1);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T629/parent-snapshot-undo.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), parentId);
  await expect.poll(() => readParent(page)).toEqual(restored);
  await expect(page.locator('.cm-md-image-cloze-region')).toHaveCount(1);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T629/parent-snapshot-reloaded.png') });
});
