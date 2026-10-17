import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const NODE = 'image-content-commit';
const OTHER = 'image-content-other';
const SOURCE = fs.readFileSync('assets/brand/foliole-leaf-tight.png').toString('base64');
const OUT = path.resolve('.tmp/artifacts/version-origin-investigation');

async function inspect(app: ElectronApplication) {
  return app.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      return db.prepare(`SELECT id, content, resource_references,
        (SELECT count(*) FROM node_sync_versions v WHERE v.object_id = n.id) AS versions
        FROM nodes n WHERE id IN ('image-content-commit', 'image-content-other') ORDER BY id`).all();
    });
  });
}

async function prepare(page: Page) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await page.evaluate(async ({ node, other }) => window.__folioleWorkspaceDebug?.seedNodes?.([
    { id: node, content: 'Original body', kind: 'topic', title: 'Image commit' },
    { id: other, content: 'Other body', kind: 'topic', title: 'Other topic' }
  ], { persist: true }), { node: NODE, other: OTHER });
  await page.locator(`[role="treeitem"][data-node-id="${NODE}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent('prompt-editor'))).toBe('Original body');
}

async function paste(page: Page, count = 1) {
  await page.locator('.prompt-editor-host .cm-content').evaluate((element, { bytes, count }) => {
    const image = Uint8Array.from(atob(bytes), character => character.charCodeAt(0));
    const clipboardData = new DataTransfer();
    for (let index = 0; index < count; index++) clipboardData.items.add(new File([image], `original-${index}.png`, { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  }, { bytes: SOURCE, count });
}

test('commits multiple pasted images and their original name with one body save and survives reload', async ({ desktopApp, desktopWindow: page }) => {
  await prepare(page);
  const before = await inspect(desktopApp);
  await paste(page, 2);
  await expect.poll(async () => (await loadNodeDocument(page, NODE))?.content, { timeout: 15000 }).toContain('![original-1]');
  const after = await inspect(desktopApp);
  const saved = after.find((row: { id: string }) => row.id === NODE);
  const initial = before.find((row: { id: string }) => row.id === NODE);
  expect(saved.versions).toBe(initial.versions + 1);
  expect(JSON.parse(saved.resource_references)).toEqual([expect.objectContaining({ original_name: 'original-0.png', role: 'image' })]);
  expect(after.find((row: { id: string }) => row.id === OTHER)).toEqual(before.find((row: { id: string }) => row.id === OTHER));
  await page.reload();
  await expectWorkspaceShell(page);
  await expect(page.locator('.prompt-editor-host img.cm-md-image-element')).toHaveCount(2);
  await expect.poll(() => page.locator('.prompt-editor-host img.cm-md-image-element').evaluateAll((images: HTMLImageElement[]) =>
    images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'mac-image-content-reloaded.png') });
  fs.writeFileSync(path.join(OUT, 'mac-image-content.json'), JSON.stringify({ before, after }, null, 2));
});

test('preparing an image then switching topics creates no resource description or topic version', async ({ desktopApp, desktopWindow: page }) => {
  await prepare(page);
  const before = await inspect(desktopApp);
  await desktopApp.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const pending = globalThis as typeof globalThis & { imagePrepared?: boolean; releaseImage?: () => void };
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      const result = await handleInvokeRequest(request, { sender: event.sender });
      if (request.command === 'import_clipboard_image_attachment') {
        pending.imagePrepared = true;
        await new Promise<void>(resolve => { pending.releaseImage = resolve; });
      }
      return result;
    });
  });
  await paste(page);
  await expect.poll(() => desktopApp.evaluate(() => Boolean((globalThis as typeof globalThis & { imagePrepared?: boolean }).imagePrepared))).toBe(true);
  expect(await inspect(desktopApp)).toEqual(before);
  await page.locator(`[role="treeitem"][data-node-id="${OTHER}"]`).click();
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent('prompt-editor'))).toBe('Other body');
  await desktopApp.evaluate(() => (globalThis as typeof globalThis & { releaseImage?: () => void }).releaseImage?.());
  await expect(page.getByTestId('app-runtime-notice')).toBeVisible();
  expect(await inspect(desktopApp)).toEqual(before);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'mac-image-canceled.png') });
});
