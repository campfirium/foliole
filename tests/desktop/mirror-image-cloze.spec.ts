import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { createVisualPdfFixture, importPdf } from './pdf-image-excerpt-test-support';

async function readOutputs(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const pathApi = process.getBuiltinModule('path')!;
    const fsApi = process.getBuiltinModule('fs')!;
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    const { loadLibraryPathSettingsSync } = require(`${cwd}/dist/electron/ipc/libraryPaths.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const root = loadLibraryPathSettingsSync().mirror;
      const records = connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path FROM mirror_articles WHERE article_id NOT LIKE 'special-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string }>;
      return { names: fsApi.readdirSync(root), files: records.map((record) => {
        const file = pathApi.join(root, record.relative_path);
        return { ...record, body: fsApi.readFileSync(file, 'utf8'), mtime: fsApi.statSync(file).mtimeMs };
      }) };
    });
  }, process.cwd());
}

async function configureTopicExportDialog(app: ElectronApplication) {
  return app.evaluate(({ dialog }) => {
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/image-cloze-export.md`;
    const original = dialog.showSaveDialog;
    (globalThis as unknown as { restoreTopicDialog: () => void }).restoreTopicDialog = () => { dialog.showSaveDialog = original; };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    return filePath;
  });
}

async function settleInitialMirror(app: ElectronApplication) {
  await app.evaluate(async (_, cwd) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const { submitDesktopOperation } = require(`${cwd}/dist/electron/desktopOperations.js`);
    const { resumePendingMirrorOutput } = require(`${cwd}/dist/electron/mirror/rebuildMirrorOutput.js`);
    await submitDesktopOperation('mirror-backfill', { run: resumePendingMirrorOutput }).promise;
    await require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
  }, process.cwd());
}

async function exportFromPalette(app: ElectronApplication, page: Page, ownerId: string, body: string) {
  const output = await configureTopicExportDialog(app);
  try {
    await page.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), ownerId);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
    const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
    await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('export');
    await palette.getByRole('button', { name: /^(Export Current Topic|导出当前主题)$/ }).click();
    await expect.poll(() => app.evaluate((_, file) => {
      const fsApi = process.getBuiltinModule('fs')!;
      return fsApi.existsSync(file) ? fsApi.readFileSync(file, 'utf8') : null;
    }, output)).toBe(body);
  } finally {
    await app.evaluate(() => (globalThis as unknown as { restoreTopicDialog: () => void }).restoreTopicDialog());
  }
}

async function createImageCloze(page: Page, parentId: string) {
  await page.getByRole('region', { name: /Left toolbar|左侧工具栏/ })
    .getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('cloze');
  await palette.locator('button[aria-label="Cloze Selection"], button[aria-label="挖空所选内容"]').click();
  const surface = page.locator('.cm-md-image-surface-block').first();
  await surface.scrollIntoViewIfNeeded();
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('Expected source image');
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Confirm image cloze' }).click();
  await expect.poll(() => page.evaluate((id) => window.__folioleWorkspaceDebug!.listNodes()
    .map(({ id }) => window.__folioleWorkspaceDebug!.getNode(id))
    .filter((node) => node?.parentNodeId === id && node.anchorKind === 'cloze').length, parentId)).toBe(1);
  return page.evaluate((id) => window.__folioleWorkspaceDebug!.listNodes()
    .map(({ id }) => window.__folioleWorkspaceDebug!.getNode(id))
    .find((node) => node?.parentNodeId === id && node.anchorKind === 'cloze')!.id, parentId);
}

async function updateClozeText(page: Page, excerptId: string, ownerId: string) {
  return page.evaluate(async ({ excerptId, ownerId }) => {
    const snapshot = await window.electronAPI!.invoke('load_node_document', { nodeId: excerptId }) as {
      content: string; reveal: string;
    };
    const node = window.__folioleWorkspaceDebug!.getNode(excerptId)!;
    if (!snapshot.content.includes('asset://') || !snapshot.reveal.includes('asset://')) throw new Error('Expected saved original image');
    if (!node.anchorLink?.locator || !('attachmentId' in node.anchorLink.locator)) throw new Error('Expected generic image locator');
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: excerptId, parentNodeId: ownerId, kind: 'item', title: node.title,
      content: snapshot.content + '\nCurrent diagram prompt.', reveal: snapshot.reveal + '\nCurrent diagram answer.',
      isTitleManual: false, hideTitleHeading: false, position: 0, anchorLink: node.anchorLink,
      createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
    });
    return { ...snapshot, anchorLink: node.anchorLink };
  }, { excerptId, ownerId });
}

async function seedImageSource(desktopWindow: Page) {
  const bytes = fs.readFileSync(path.resolve('assets/brand/foliole-leaf-tight.png'));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const ownerId = 't513-image-source';
  await desktopWindow.evaluate(async ({ ownerId, hash, bytesBase64 }) => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([{ id: ownerId, kind: 'topic', title: 'Image source',
      content: `![Original image](asset://${hash}.png)` }], { persist: true });
    await debug.importClipboardImageAttachment!({ bytesBase64, mimeType: 'image/png',
      nodeId: ownerId, originalName: 'original.png' });
    await debug.openNode(ownerId);
  }, { ownerId, hash, bytesBase64: bytes.toString('base64') });
  await desktopWindow.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .some((image) => image.complete && image.naturalWidth > 0));
  return ownerId;
}

async function seedPdfScreenshot(app: ElectronApplication, page: Page) {
  const fixture = path.resolve('.tmp/artifacts/T513/2f-b/Diagram.pdf');
  createVisualPdfFixture(fixture, null);
  const pdfId = await importPdf(app, page, fixture);
  await page.getByRole('region', { name: /Left toolbar|左侧工具栏/ })
    .getByRole('button', { name: /Command Palette|命令面板/ }).click();
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('annotation');
  await palette.locator('button[aria-label="Annotate Selection"], button[aria-label="批注所选内容"]').click();
  const bounds = await page.locator('.pdf-visual-excerpt-page').first().boundingBox();
  if (!bounds) throw new Error('Expected PDF page');
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.75);
  await page.mouse.up();
  await page.getByRole('textbox', { name: /Add an annotation|添加批注/ }).fill('PDF image note.');
  await page.getByRole('button', { name: /Save|保存/, exact: true }).click();
  const excerpt = page.getByRole('treeitem', { name: /Excerpt 1/ });
  await expect(excerpt).toBeVisible();
  const id = (await excerpt.getAttribute('data-node-id'))!;
  await page.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), id);
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('.cm-md-image-element-block'))
    .some((image) => image.complete && image.naturalWidth > 0));
  return { id, pdfId };
}

for (const pdf of [false, true]) test(`mirrors a real ${pdf ? 'PDF screenshot' : 'ordinary image'} cloze through all output paths`, async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.seedNodes([
    { id: 't513-image-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
  ], { persist: true }));
  const source = pdf ? await seedPdfScreenshot(desktopApp, desktopWindow) : null;
  const parentId = source?.id ?? await seedImageSource(desktopWindow);
  const ownerId = source?.pdfId ?? parentId;
  const excerptId = await createImageCloze(desktopWindow, parentId);
  await settleInitialMirror(desktopApp);
  const before = await readOutputs(desktopApp);
  const saved = await updateClozeText(desktopWindow, excerptId, parentId);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === ownerId)!.body,
    { timeout: 30_000 }).toContain('Current diagram prompt.');
  const after = await readOutputs(desktopApp);
  const body = after.files.find((file) => file.article_id === ownerId)!.body;
  for (const fact of ['Current diagram prompt.', 'Current diagram answer.']) expect(body.split(fact)).toHaveLength(2);
  expect(body).toContain(pdf ? '![Image excerpt]' : '![Original image]');
  if (!pdf) expect(body).not.toContain('PDF page');
  expect(body).not.toContain('<u>');
  expect(body).not.toContain('asset://');
  const crop = body.match(/!\[(?:Original image|Image excerpt)\]\(([^)]+)\)/)![1]!;
  const resourceBefore = await desktopApp.evaluate((_, file) => {
    const fsApi = process.getBuiltinModule('fs')!;
    return { bytes: fsApi.readFileSync(file).toString('base64'), mtime: fsApi.statSync(file).mtimeMs };
  }, crop);
  expect(resourceBefore.bytes.length).toBeGreaterThan(20);
  expect(after.files.filter((file) => file.article_id !== ownerId)).toEqual(
    before.files.filter((file) => file.article_id !== ownerId));
  expect(after.files.some((file) => file.article_id === excerptId)).toBe(false);
  await exportFromPalette(desktopApp, desktopWindow, ownerId, body);
  await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
  const rebuilt = await readOutputs(desktopApp);
  expect(rebuilt.files.find((file) => file.article_id === ownerId)!.body).toBe(body);
  expect(await desktopApp.evaluate((_, file) => {
    const fsApi = process.getBuiltinModule('fs')!;
    return { bytes: fsApi.readFileSync(file).toString('base64'), mtime: fsApi.statSync(file).mtimeMs };
  }, crop)).toEqual(resourceBefore);
  await desktopWindow.evaluate(async (id) => {
    const debug = window.__folioleWorkspaceDebug!;
    if (!await debug.deleteNode(id)) throw new Error('Expected crop in Trash');
    if (!await debug.deleteNodePermanently(id)) throw new Error('Expected crop deletion');
  }, excerptId);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === ownerId)!.body,
    { timeout: 30_000 }).not.toContain('Current diagram prompt.');
  const deleted = await readOutputs(desktopApp);
  expect(deleted.files.filter((file) => file.article_id !== ownerId)).toEqual(
    rebuilt.files.filter((file) => file.article_id !== ownerId));
  await testInfo.attach('image-cloze-output', {
    body: JSON.stringify({ ownerId, excerptId, saved, before, after, rebuilt, deleted, crop, resourceBefore }, null, 2),
    contentType: 'application/json'
  });
});
