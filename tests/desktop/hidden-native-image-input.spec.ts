import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const OWNER_ID = 'hidden-native-image-source';

async function seedImageSource(page: Page) {
  const bytes = fs.readFileSync(path.resolve('assets/brand/foliole-leaf-tight.png'));
  const hash = createHash('sha256').update(bytes).digest('hex');
  await page.evaluate(async ({ hash, bytesBase64, ownerId }) => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([{ id: ownerId, kind: 'topic', title: 'Image input isolation',
      content: `![Original image](asset://${hash}.png)` }], { persist: true });
    await debug.importClipboardImageAttachment!({ bytesBase64, mimeType: 'image/png',
      nodeId: ownerId, originalName: 'original.png' });
    await debug.openNode(ownerId);
  }, { ownerId: OWNER_ID, hash, bytesBase64: bytes.toString('base64') });
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .some((image) => image.complete && image.naturalWidth > 0));
}

async function dragImageCloze(page: Page) {
  const surface = page.locator('.cm-md-image-surface-block').first();
  await surface.hover();
  await expect(surface.locator('.cm-md-image-cloze-overlay')).toBeVisible();
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('Expected source image');
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.75, { steps: 8 });
  await page.mouse.up();
}

async function clozeIds(page: Page) {
  return page.evaluate(ownerId => window.__folioleWorkspaceDebug!.listNodes()
    .map(({ id }) => window.__folioleWorkspaceDebug!.getNode(id))
    .filter(node => node?.parentNodeId === ownerId && node.anchorKind === 'cloze')
    .map(node => node!.id), OWNER_ID);
}

test('hidden image drag keeps confirmation, honors deliberate leave, and persists creation', async ({
  desktopApp, desktopWindow: page
}, info) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await seedImageSource(page);
  const before = await desktopApp.evaluate(({ BrowserWindow, screen }) => ({
    cursor: screen.getCursorScreenPoint(), focused: BrowserWindow.getFocusedWindow() !== null
  }));
  const confirm = page.getByRole('button', { name: 'Confirm image cloze' });
  await dragImageCloze(page);
  await expect(confirm).toBeVisible();
  await page.mouse.move(1, 1);
  await expect(confirm).toBeHidden();
  expect(await clozeIds(page)).toEqual([]);
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(() => clozeIds(page)).toEqual([]);
  await page.evaluate(ownerId => window.__folioleWorkspaceDebug!.openNode(ownerId), OWNER_ID);
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .some(image => image.complete && image.naturalWidth > 0));
  await dragImageCloze(page);
  await confirm.click();
  await expect.poll(() => clozeIds(page)).toHaveLength(1);
  const created = await clozeIds(page);
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(() => clozeIds(page)).toEqual(created);
  const after = await desktopApp.evaluate(({ BrowserWindow, screen }) => ({
    cursor: screen.getCursorScreenPoint(), focused: BrowserWindow.getFocusedWindow() !== null
  }));
  expect(before.focused).toBe(false);
  expect(after.focused).toBe(false);
  const environment = info.outputPath('desktop-input-environment.json');
  const screenshot = info.outputPath('created-image-cloze.png');
  fs.writeFileSync(environment, JSON.stringify({ before, after }, null, 2));
  await page.screenshot({ path: screenshot });
  await info.attach('desktop-input-environment', { path: environment, contentType: 'application/json' });
  await info.attach('created-image-cloze', { path: screenshot, contentType: 'image/png' });
});
