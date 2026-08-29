import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/T156-3-image-excerpt-visible.png');
const SOURCE_IMAGE_PATH = path.resolve('assets/brand/foliole-leaf-tight.png');
const PARENT_ID = 'topic-image-excerpt';

async function seedRepeatedImageTopic(page: Page) {
  const sourceBuffer = fs.readFileSync(SOURCE_IMAGE_PATH);
  const attachmentId = createHash('sha256').update(sourceBuffer).digest('hex');
  const sourceBytes = sourceBuffer.toString('base64');
  return page.evaluate(async ({ attachmentId, parentId, sourceBytes }) => {
    const debug = window.__folioleWorkspaceDebug;
    const image = `![Leaf](asset://${attachmentId}.png)`;
    const content = `${image}\nBetween occurrences\n${image}`;
    await debug?.seedNodes?.([{ content, id: parentId, kind: 'topic', title: 'T156 Image Excerpt' }]);
    const importedAttachmentId = await debug?.importClipboardImageAttachment?.({
      bytesBase64: sourceBytes,
      mimeType: 'image/png',
      nodeId: parentId,
      originalName: 'foliole-leaf-tight.png'
    });
    if (importedAttachmentId !== attachmentId) return null;
    await debug?.openNode?.(parentId);
    return { attachmentId, content, image, secondFrom: content.lastIndexOf(image) };
  }, { attachmentId, parentId: PARENT_ID, sourceBytes });
}

async function requestAnnotation(page: Page) {
  const ribbon = page.getByRole('region', { name: /Left toolbar|左侧工具栏/ });
  await ribbon.getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('annotation');
  await palette.locator('button[aria-label="Annotate Selection"], button[aria-label="批注所选内容"]').click();
}

async function waitForRepeatedImages(page: Page) {
  const surfaces = page.locator('.cm-md-image-surface-block');
  await expect(surfaces).toHaveCount(2);
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .every((image) => image.complete && image.naturalWidth > 0));
  return surfaces;
}

async function dragSecondImageRegion(page: Page) {
  const surface = (await waitForRepeatedImages(page)).nth(1);
  await surface.scrollIntoViewIfNeeded();
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('second image surface has no bounds');
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.6, { steps: 8 });
  await page.mouse.up();
}

async function occurrenceRegionState(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.cm-md-image-widget')).map((widget) => {
    const region = widget.querySelector<HTMLElement>('.cm-md-image-cloze-region');
    return region ? {
      height: region.style.height,
      left: region.style.left,
      top: region.style.top,
      width: region.style.width
    } : null;
  }));
}

async function scrollEditor(page: Page, edge: 'start' | 'end') {
  const editor = page.locator('.cm-content[role="textbox"]');
  await editor.evaluate((content, targetEdge) => {
    const scroller = content.closest<HTMLElement>('.cm-scroller');
    if (!scroller) return;
    scroller.scrollTop = targetEdge === 'start' ? 0 : scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll'));
  }, edge);
}

async function occurrenceStateAt(page: Page, from: number) {
  return page.evaluate((imageFrom) => {
    const widget = document.querySelector<HTMLElement>(`.cm-md-image-widget[data-md-image-from="${imageFrom}"]`);
    const region = widget?.querySelector<HTMLElement>('.cm-md-image-cloze-region');
    return {
      region: region ? {
        height: region.style.height,
        left: region.style.left,
        top: region.style.top,
        width: region.style.width
      } : null,
      rendered: Boolean(widget)
    };
  }, from);
}

async function verifyPersistedExcerptLifecycle(args: {
  excerptId: string;
  initialRegion: Awaited<ReturnType<typeof occurrenceStateAt>>['region'];
  page: Page;
  seeded: NonNullable<Awaited<ReturnType<typeof seedRepeatedImageTopic>>>;
}) {
  await args.page.reload();
  await expect.poll(() => args.page.evaluate((nodeId) => Boolean(
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)
  ), PARENT_ID)).toBe(true);
  await args.page.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), PARENT_ID);
  await expect.poll(() => args.page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(PARENT_ID);
  await expect(args.page.locator('.cm-content[role="textbox"]')).toContainText('Between occurrences');
  await expect.poll(async () => {
    await scrollEditor(args.page, 'start');
    return occurrenceStateAt(args.page, 0);
  }).toEqual({ region: null, rendered: true });
  await expect.poll(async () => {
    await scrollEditor(args.page, 'end');
    return occurrenceStateAt(args.page, args.seeded.secondFrom);
  }).toEqual({ region: args.initialRegion, rendered: true });
  await args.page.evaluate(async (nodeId) => window.__folioleWorkspaceDebug?.deleteNode?.(nodeId), args.excerptId);
  await expect.poll(() => occurrenceStateAt(args.page, args.seeded.secondFrom)).toEqual({ region: null, rendered: true });
  await args.page.evaluate(async (nodeId) => window.__folioleWorkspaceDebug?.restoreNode?.(nodeId), args.excerptId);
  await args.page.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), PARENT_ID);
  await expect.poll(() => args.page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(PARENT_ID);
  await expect.poll(async () => {
    await scrollEditor(args.page, 'end');
    return occurrenceStateAt(args.page, args.seeded.secondFrom);
  }).toEqual({ region: args.initialRegion, rendered: true });
  await args.page.evaluate(async ({ content, parentId }) => {
    await window.__folioleWorkspaceDebug?.updateNodeContent?.(parentId, `Lead\n${content}`);
  }, { content: args.seeded.content, parentId: PARENT_ID });
  await expect.poll(() => args.page.evaluate((nodeId) => (
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.anchorLink?.locator
  ), args.excerptId)).toMatchObject({ from: args.seeded.secondFrom + 5, originalText: args.seeded.image });
  await expect.poll(async () => {
    await scrollEditor(args.page, 'end');
    return occurrenceStateAt(args.page, args.seeded.secondFrom + 5);
  }).toEqual({ region: args.initialRegion, rendered: true });
}

test('creates an annotated image excerpt bound to one repeated image occurrence', async ({ desktopWindow }, testInfo) => {
  const seeded = await seedRepeatedImageTopic(desktopWindow);
  expect(seeded).not.toBeNull();
  await waitForRepeatedImages(desktopWindow);
  await requestAnnotation(desktopWindow);
  await dragSecondImageRegion(desktopWindow);

  const noteInput = desktopWindow.getByRole('textbox', { name: /Add a comment|添加批注/ });
  await expect(noteInput).toBeVisible();
  await noteInput.fill('Occurrence detail');
  await desktopWindow.getByRole('button', { name: /Save|保存/, exact: true }).click();

  const excerptItem = desktopWindow.getByRole('treeitem', { name: /Excerpt 1/ });
  await expect(excerptItem).toBeVisible();
  const excerptId = await excerptItem.getAttribute('data-node-id');
  if (!excerptId || !seeded) throw new Error('missing created image excerpt');
  await expect.poll(() => occurrenceRegionState(desktopWindow)).toEqual([null, expect.any(Object)]);
  const initialRegion = (await occurrenceStateAt(desktopWindow, seeded.secondFrom)).region;
  const initialNode = await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.getNode?.(nodeId), excerptId);
  expect(initialNode?.anchorLink?.locator).toMatchObject({
    from: seeded.secondFrom,
    originalText: seeded.image,
    to: seeded.secondFrom + seeded.image.length
  });
  expect(initialNode?.content).toMatch(/asset:\/\/[^)]+\.png\)\n※ Occurrence detail$/);
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('T156-3-visible', { contentType: 'image/png', path: SCREENSHOT_PATH });

  const region = desktopWindow.locator(`.cm-md-image-widget[data-md-image-from="${seeded.secondFrom}"] .cm-md-image-cloze-region`);
  const regionBounds = await region.boundingBox();
  if (!regionBounds) throw new Error('missing image excerpt outline');
  await desktopWindow.mouse.click(regionBounds.x + 1, regionBounds.y + regionBounds.height / 2);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(excerptId);
  await verifyPersistedExcerptLifecycle({ excerptId, initialRegion, page: desktopWindow, seeded });
});
