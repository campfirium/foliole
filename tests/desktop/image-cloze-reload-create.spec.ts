import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import type { WorkspaceRuntimeNodeDocument } from '../../src/shared/platform/workspaceRuntimeTypes';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const OWNER_ID = 'hidden-native-image-source';

async function seedImageSource(page: Page, imageCount = 1) {
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

async function dragImageCloze(page: Page, useUnusedCorner = false) {
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

async function clozeIds(page: Page) {
  return page.evaluate(ownerId => window.__folioleWorkspaceDebug!.listNodes()
    .map(({ id }) => window.__folioleWorkspaceDebug!.getNode(id))
    .filter(node => node?.parentNodeId === ownerId && node.anchorKind === 'cloze')
    .map(node => node!.id), OWNER_ID);
}

async function openSource(page: Page) {
  await page.evaluate(ownerId => window.__folioleWorkspaceDebug!.openNode(ownerId), OWNER_ID);
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .some(image => image.complete && image.naturalWidth > 0));
}

async function readDocument(page: Page, nodeId: string) {
  return page.evaluate(id => window.electronAPI!.invoke('load_node_document', { nodeId: id }), nodeId) as Promise<WorkspaceRuntimeNodeDocument>;
}

for (const reload of [false, true]) {
  test(`creates another image cloze with an existing region ${reload ? 'after reload' : 'without reload'}`, async ({
    desktopWindow: page
  }, info) => {
    await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
    await page.reload();
    await expectWorkspaceShell(page);
    await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
    await seedImageSource(page);
    await dragImageCloze(page);
    await page.getByRole('button', { name: 'Confirm image cloze' }).click();
    await expect.poll(() => clozeIds(page)).toHaveLength(1);
    const firstId = (await clozeIds(page))[0]!;
    const first = await readDocument(page, firstId);
    const parent = await readDocument(page, OWNER_ID);
    expect(first.kind).toBe('item');
    expect(first.content).toContain('asset://');
    expect(first.reveal).toContain('asset://');
    expect(first.imageRegions?.flatMap(group => group.regions)).toHaveLength(1);
    if (reload) {
      await page.reload();
      await expectWorkspaceShell(page);
      await expect.poll(() => clozeIds(page)).toEqual([firstId]);
    }
    await openSource(page);
    await expect(page.locator('.cm-md-image-cloze-region')).toHaveCount(1);
    await dragImageCloze(page, true);
    await expect(page.getByRole('button', { name: 'Confirm image cloze' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm image cloze' }).click();
    await expect.poll(() => clozeIds(page)).toHaveLength(2);
    const created = await clozeIds(page);
    const secondId = created.find(id => id !== firstId)!;
    const second = await readDocument(page, secondId);
    const saved = await readDocument(page, OWNER_ID);
    expect(await readDocument(page, firstId)).toEqual(first);
    expect(saved.content).toBe(parent.content);
    const persistedRegions = [saved, first, second].flatMap(doc => doc.imageRegions?.flatMap(group => group.regions) ?? []);
    expect(new Set(persistedRegions.map(region => region.id)).size).toBe(2);
    expect(persistedRegions).toEqual(expect.arrayContaining(first.imageRegions!.flatMap(group => group.regions)));
    expect(persistedRegions).toEqual(expect.arrayContaining(second.imageRegions!.flatMap(group => group.regions)));
    expect(second.kind).toBe('item');
    expect(second.content).toContain(parent.content);
    expect(second.reveal).toBe(first.reveal);
    await page.reload();
    await expectWorkspaceShell(page);
    await expect.poll(async () => (await clozeIds(page)).sort()).toEqual([...created].sort());
    await openSource(page);
    await expect(page.locator('.cm-md-image-cloze-region')).toHaveCount(2);
    expect(await readDocument(page, OWNER_ID)).toEqual(saved);
    expect(await readDocument(page, firstId)).toEqual(first);
    expect(await readDocument(page, secondId)).toEqual(second);
    fs.writeFileSync(info.outputPath('persisted-documents.json'), JSON.stringify({ parent, first, saved, second, created }, null, 2));
    await page.screenshot({ path: info.outputPath('two-persisted-clozes.png') });
  });
}

test('saves image focus for one occurrence and preserves it when creating a cloze', async ({ desktopWindow: page }, info) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await seedImageSource(page, 2);
  const original = (await readDocument(page, OWNER_ID)).content.split('\n\n')[0];
  await expect(page.locator('.cm-md-image-element-block')).toHaveCount(2);
  await dragImageCloze(page);
  await page.getByRole('button', { name: 'Focus image region' }).click();
  const masks = page.locator('.cm-md-image-focus-mask');
  await expect(masks).toHaveCount(1);
  await expect(masks.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.3)');
  await expect(masks.first()).toHaveCSS('clip-path', /^polygon\(evenodd,/u);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toContain(';focus=');
  const saved = (await readDocument(page, OWNER_ID)).content;
  expect(saved.split('\n\n')[1]).toBe(original);
  await dragImageCloze(page, true);
  await page.getByRole('button', { name: 'Confirm image cloze' }).click();
  await expect.poll(() => clozeIds(page)).toHaveLength(1);
  const cloze = await readDocument(page, (await clozeIds(page))[0]!);
  expect(cloze.content).toBe(saved.split('\n\n')[0]);
  expect(cloze.reveal).toBe(cloze.content);
  expect(cloze.imageRegions?.flatMap(group => group.regions)).toHaveLength(1);
  await page.reload();
  await expectWorkspaceShell(page);
  await openSource(page);
  await expect(masks).toHaveCount(1);
  expect(await masks.first().locator('xpath=ancestor::*[contains(@class,"cm-md-image-widget")]').getAttribute('data-md-image-from')).toBe('0');
  expect((await readDocument(page, OWNER_ID)).content).toBe(saved);
  await page.screenshot({ path: info.outputPath('saved-image-focus.png') });
});
