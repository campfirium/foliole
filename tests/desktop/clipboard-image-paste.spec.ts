import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const ORIGINAL = 'Before IMPORTANT after';
const NODE = 'clipboard-image-paste';
const OUT = path.resolve('.tmp/artifacts/image-paste-repair');
const UNDO = process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z';
const REDO = process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Y';

async function content(page: Page) {
  return page.evaluate(() => window.__folioleDebug?.getEditorContent('prompt-editor'));
}

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await page.evaluate(async ({ id, content }) => window.__folioleWorkspaceDebug?.seedNodes?.([
    { id, content, kind: 'topic', title: 'Image paste' },
    { id: 'image-neighbor', content: 'Untouched neighbor', kind: 'topic', title: 'Neighbor' }
  ], { persist: true }), { id: NODE, content: ORIGINAL });
  await page.locator(`[role="treeitem"][data-node-id="${NODE}"]`).click();
  await expect.poll(() => content(page)).toBe(ORIGINAL);
  expect(await page.evaluate(() => window.__folioleDebug?.setEditorSelection('prompt-editor', 7, 16))).toBe(true);
}

async function pasteImage(page: Page) {
  const base64 = fs.readFileSync('assets/brand/foliole-leaf-tight.png').toString('base64');
  await page.locator('.prompt-editor-host .cm-content').evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([bytes], 'clip.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  }, base64);
}

async function capture(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({
    content: await content(page), document: await loadNodeDocument(page, NODE)
  }, null, 2));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function reopen(page: Page, expected: string) {
  await page.locator('[role="treeitem"][data-node-id="image-neighbor"]').click();
  await expect.poll(() => content(page)).toBe('Untouched neighbor');
  await page.locator(`[role="treeitem"][data-node-id="${NODE}"]`).click();
  await expect.poll(() => content(page)).toBe(expected);
  await expect.poll(async () => (await loadNodeDocument(page, NODE))?.content).toBe(expected);
}

test('image replacement supports one undo and redo and survives reopening', async ({ desktopWindow: page }) => {
  await prepare(page);
  await pasteImage(page);
  await expect.poll(() => content(page)).toMatch(/^Before !\[clip\]\(asset:\/\/.+\) after$/);
  const inserted = (await content(page))!;
  await page.keyboard.press(UNDO);
  await expect.poll(() => content(page)).toBe(ORIGINAL);
  await capture(page, 'success-undo');
  await page.keyboard.press(REDO);
  await expect.poll(() => content(page)).toBe(inserted);
  await reopen(page, inserted);
  await page.reload();
  await expectWorkspaceShell(page);
  await expect.poll(() => content(page)).toBe(inserted);
  await capture(page, 'success-reloaded');
});

for (const failure of ['result', 'rejection']) {
  test(`failed image import preserves original text: ${failure}`, async ({ desktopApp, desktopWindow: page }) => {
    await prepare(page);
    await desktopApp.evaluate(({ ipcMain }, failure) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
      ipcMain.removeHandler('foliole:invoke');
      ipcMain.handle('foliole:invoke', (event, request) => {
        if (request.command !== 'import_clipboard_image_attachment') {
          return handleInvokeRequest(request, { sender: event.sender });
        }
        if (failure === 'rejection') throw new Error('Image import test rejection');
        return { status: 'error', message: 'Image import test failure' };
      });
    }, failure);
    await pasteImage(page);
    await expect(page.getByTestId('app-runtime-notice')).toBeVisible();
    expect(await content(page)).toBe(ORIGINAL);
    await capture(page, `failure-${failure}`);
    await reopen(page, ORIGINAL);
  });
}
