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
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/pdf-text-export.md`;
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

async function createAnnotatedCrop(page: Page) {
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
  await page.getByRole('textbox', { name: /Add an annotation|添加批注/ }).fill('Initial diagram note.');
  await page.getByRole('button', { name: /Save|保存/, exact: true }).click();
  const node = page.getByRole('treeitem', { name: /Excerpt 1/ });
  await expect(node).toBeVisible();
  const id = await node.getAttribute('data-node-id');
  if (!id) throw new Error('Expected excerpt id');
  return id;
}

async function updateCropNote(page: Page, excerptId: string, ownerId: string) {
  await page.evaluate(async ({ excerptId, ownerId }) => {
    const snapshot = await window.electronAPI!.invoke('load_node_document', { nodeId: excerptId }) as {
      content: string;
    };
    if (!snapshot.content.includes('asset://')) throw new Error('Expected persisted crop reference');
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: excerptId, parentNodeId: ownerId, kind: 'topic', title: 'Excerpt 1',
      content: snapshot.content.replace('Initial diagram note.', 'Current diagram note.'), reveal: null,
      isTitleManual: false, hideTitleHeading: false, position: 0, anchorLink: window.__folioleWorkspaceDebug!.getNode(excerptId)!.anchorLink,
      createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
    });
  }, { excerptId, ownerId });
}

test('mirrors a real PDF region crop and its saved notes through automatic, current-topic and full output', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.seedNodes([
    { id: 't513-pdf-image-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
  ], { persist: true }));
  const fixture = path.resolve('.tmp/artifacts/T513/2e-b/Diagram source.pdf');
  createVisualPdfFixture(fixture, null);
  const ownerId = await importPdf(desktopApp, desktopWindow, fixture);
  const excerptId = await createAnnotatedCrop(desktopWindow);
  await settleInitialMirror(desktopApp);
  const before = await readOutputs(desktopApp);
  await updateCropNote(desktopWindow, excerptId, ownerId);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === ownerId)!.body,
    { timeout: 30_000 }).toContain('Current diagram note.');
  const after = await readOutputs(desktopApp);
  const body = after.files.find((file) => file.article_id === ownerId)!.body;
  for (const fact of ['Current diagram note.', 'PDF page: 1', '![Image excerpt]']) expect(body.split(fact)).toHaveLength(2);
  expect(body).not.toContain('Initial diagram note.');
  expect(body).toMatch(/\[PDF source\]\(<\/.*\.pdf>\)/);
  expect(body).not.toContain('asset://');
  const crop = body.match(/!\[Image excerpt\]\(([^)]+)\)/)![1]!;
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
    { timeout: 30_000 }).not.toContain('Current diagram note.');
  const deleted = await readOutputs(desktopApp);
  expect(deleted.files.filter((file) => file.article_id !== ownerId)).toEqual(
    rebuilt.files.filter((file) => file.article_id !== ownerId));
  await testInfo.attach('pdf-image-output', {
    body: JSON.stringify({ ownerId, excerptId, before, after, rebuilt, deleted, crop, resourceBefore }, null, 2),
    contentType: 'application/json'
  });
});
