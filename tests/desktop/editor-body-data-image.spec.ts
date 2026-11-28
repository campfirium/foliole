import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const ID = 'native-body-data-image-source';
const ORIGINAL = 'Before the figure.\n\n';

test('saves a pasted oversized inline image as a visible attachment without splitting', async ({
  desktopApp, desktopWindow: page
}, testInfo) => {
  const imageBase64 = await desktopApp.evaluate(({ nativeImage }) => {
    const pixels = Buffer.alloc(900 * 700 * 4);
    for (let index = 0, seed = 1; index < pixels.length; index += 1) {
      seed = (seed * 48271) % 2147483647;
      pixels[index] = index % 4 === 3 ? 255 : seed % 256;
    }
    return nativeImage.createFromBitmap(pixels, { width: 900, height: 700 }).toPNG().toString('base64');
  });
  expect(imageBase64.length).toBeGreaterThan(1024 * 1024);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ id, content }) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{ id, content, kind: 'topic', title: 'Pasted figure' }], { persist: true });
    await window.__folioleWorkspaceDebug?.openNode?.(id);
  }, { id: ID, content: ORIGINAL });
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(ORIGINAL);
  await page.evaluate((position) => window.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position), ORIGINAL.length);
  await page.locator('.prompt-editor-host .cm-content').click();
  await page.keyboard.insertText(`![Pasted figure](data:image/png;base64,${imageBase64})\n\nAfter the figure.`);

  const dialog = page.getByRole('dialog', { name: 'Text is too long' });
  await expect(dialog).toBeVisible();
  const artifacts = path.resolve('.tmp/artifacts/T899/T899-0-5');
  await mkdir(artifacts, { recursive: true });
  await dialog.screenshot({ path: path.join(artifacts, 'dialog.png') });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  const stored = async () => (await loadNodeDocument(page, ID))?.content;
  await expect.poll(stored).toMatch(
    /^Before the figure\.\n\n!\[Pasted figure\]\(asset:\/\/[a-f0-9]{64}\.png\)\n\nAfter the figure\.$/);
  const saved = await stored();
  const children = () => page.evaluate((parentId) => window.__folioleWorkspaceDebug?.listNodes()
    .filter((node) => window.__folioleWorkspaceDebug?.getNode(node.id)?.parentNodeId === parentId).length, ID);
  expect(await children()).toBe(0);

  // The open editor shows the saved text and image without being reopened.
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor'))).toBe(saved);
  const image = page.getByRole('img', { name: 'Pasted figure', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => {
    const rendered = element as HTMLImageElement;
    return { complete: rendered.complete, width: rendered.naturalWidth, height: rendered.naturalHeight };
  })).toEqual({ complete: true, width: 900, height: 700 });
  await page.locator('.prompt-editor-host .cm-md-image-surface-block').first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Excerpt image' })).toBeVisible();
  const screenshot = path.join(artifacts, 'saved-image-menu.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('saved-image-menu', { path: screenshot });

  await page.keyboard.press('Escape');
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await stored()).toBe(saved);
});
