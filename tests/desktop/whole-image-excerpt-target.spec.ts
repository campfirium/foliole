import { createHash } from 'node:crypto';
import fs from 'node:fs';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const parentId = 'whole-image-source';
const excerptId = 'whole-image-highlight';

async function seedImage(page: Page, ambiguous = false) {
  const bytes = fs.readFileSync('assets/brand/foliole-leaf-tight.png');
  const attachmentId = createHash('sha256').update(bytes).digest('hex');
  return page.evaluate(async ({ attachmentId, ambiguous, bytesBase64, excerptId, parentId }) => {
    const api = window.__folioleWorkspaceDebug!;
    const image = `![Leaf](asset://${attachmentId}.png)`;
    const child = {
      id: excerptId, kind: 'topic' as const, title: 'Whole image annotation', content: `${image}\n※ Initial thought`,
      parentNodeId: parentId,
      anchorLink: { id: 'whole-anchor', kind: 'highlight' as const,
        locator: { from: 0, to: image.length, originalText: image } },
      imageRegions: [{ attachmentId, regions: [{ id: 'whole-region', x: 0, y: 0, width: 1, height: 1 }] }]
    };
    await api.seedNodes([
      { id: parentId, kind: 'topic', title: 'Whole image source', content: image }, child,
      ...(ambiguous ? [{ ...child, id: 'duplicate-highlight', title: 'Duplicate annotation' }] : [])
    ], { persist: true });
    await api.importClipboardImageAttachment({ bytesBase64, mimeType: 'image/png', nodeId: parentId, originalName: 'leaf.png' });
    await api.openNode(parentId);
    return image;
  }, { attachmentId, ambiguous, bytesBase64: bytes.toString('base64'), excerptId, parentId });
}

async function clickWholeImage(page: Page) {
  const surface = page.locator('.prompt-editor-host .cm-md-image-surface-block').first();
  await expect(surface).toBeVisible();
  await expect(surface.locator('.cm-md-image-cloze-region[data-region-scope="full-image"]')).toHaveCount(1);
  await surface.click();
}

test('whole-image toolbar saves the current annotation and opens the same persisted excerpt', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const image = await seedImage(desktopWindow);
  await clickWholeImage(desktopWindow);
  const toolbar = desktopWindow.locator('[data-annotation-toolbar="true"]');
  await toolbar.getByRole('button', { name: /^(Add Annotation|添加批注)$/ }).click();
  const input = desktopWindow.getByPlaceholder(/Add an annotation|添加批注/);
  await expect(input).toHaveValue('Initial thought');
  await input.fill('Revised whole image thought');
  await desktopWindow.getByRole('button', { name: /^(Save|保存)$/ }).click();
  const content = `${image}\n※ Revised whole image thought`;
  await expect.poll(async () => (await loadNodeDocument(desktopWindow, excerptId))?.content).toBe(content);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), parentId);
  await clickWholeImage(desktopWindow);
  await desktopWindow.screenshot({ path: '.tmp/artifacts/T570/whole-image-toolbar.png' });
  await toolbar.getByRole('button', { name: /^(Open|打开)$/ }).click();
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBe(excerptId);
  expect((await loadNodeDocument(desktopWindow, excerptId))?.content).toBe(content);
});

test('whole-image click refuses an ambiguous excerpt target', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedImage(desktopWindow, true);
  await clickWholeImage(desktopWindow);
  await expect(desktopWindow.locator('[data-annotation-toolbar="true"]')).toHaveCount(0);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.getActiveNodeId())).toBe(parentId);
});
