import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { importPdf } from './pdf-image-excerpt-test-support';
import { createCrossPagePdf } from './pdf-selection-cross-page-fixture';

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

async function createPdfAnnotations(page: Page, ownerId: string) {
  return page.evaluate(async (parentNodeId) => {
    const debug = window.__folioleWorkspaceDebug!;
    const fragment = (page: number) => ({ page, x: 0.1, y: 0.2,
      rects: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.1 }] });
    const highlight = await debug.createTextHighlightChild({ parentNodeId, anchorId: 'pdf-highlight',
      text: 'Saved PDF excerpt.\n※ Saved PDF note.',
      anchorLink: { id: 'pdf-highlight', kind: 'highlight', locator: fragment(1) } });
    const locator = { pages: [fragment(1), fragment(2)] };
    const cloze = await debug.createTextClozeChild({ parentNodeId, anchorId: 'pdf-cloze',
      prompt: 'Initial PDF prompt [...]', answer: 'Initial PDF answer.',
      anchorLink: { id: 'pdf-cloze', kind: 'cloze', locator } });
    if (!highlight || !cloze) throw new Error('Expected saved PDF annotations');
    const nested = await debug.createTextHighlightChild({ parentNodeId: cloze, anchorId: 'nested',
      text: 'Saved nested PDF note.', anchorLink: { id: 'nested', kind: 'highlight',
        locator: { from: 0, to: 7, originalText: 'Initial' } } });
    await debug.openNode(parentNodeId);
    await window.electronAPI!.invoke('rebuild_mirror_output');
    return { highlight, cloze, nested, locator };
  }, ownerId);
}

test('keeps saved single-page and cross-page PDF text facts in every mirror entrypoint', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.seedNodes([
    { id: 't513-pdf-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
  ], { persist: true }));
  const fixture = path.resolve('.tmp/artifacts/T513/2e-a/Reading source.pdf');
  createCrossPagePdf(fixture);
  const ownerId = await importPdf(desktopApp, desktopWindow, fixture);
  const chain = await createPdfAnnotations(desktopWindow, ownerId);
  await settleInitialMirror(desktopApp);
  const before = await readOutputs(desktopApp);
  await desktopWindow.evaluate(({ chain, ownerId }) => window.electronAPI!.invoke('update_node_content', {
    nodeId: chain.cloze, parentNodeId: ownerId, kind: 'item', title: 'PDF cloze',
    content: 'Current PDF prompt [...]\nCurrent cloze note.', reveal: 'Current PDF answer.',
    isTitleManual: true, hideTitleHeading: false, position: 0,
    anchorLink: { id: 'pdf-cloze', kind: 'cloze', locator: chain.locator },
    createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
  }), { chain, ownerId });
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === ownerId)!.body,
    { timeout: 90_000 }).toContain('Current PDF answer.');
  const after = await readOutputs(desktopApp);
  const body = after.files.find((file) => file.article_id === ownerId)!.body;
  for (const fact of ['Saved PDF excerpt.', 'Saved PDF note.', 'Current PDF answer.', 'Current cloze note.',
    'PDF prompt', 'Saved nested PDF note.', 'PDF page: 1', 'PDF pages: 1, 2']) expect(body.split(fact)).toHaveLength(2);
  expect(body).not.toContain('Initial PDF answer.');
  expect(body).toMatch(/\[PDF source\]\(<\/.*\.pdf>\)/);
  expect(body).not.toContain('asset://');
  expect(after.files.filter((file) => file.article_id !== ownerId)).toEqual(
    before.files.filter((file) => file.article_id !== ownerId));
  expect(after.files).toHaveLength(before.files.length);
  expect(after.files.some((file) => [chain.highlight, chain.cloze, chain.nested].includes(file.article_id))).toBe(false);
  await exportFromPalette(desktopApp, desktopWindow, ownerId, body);
  await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
  const rebuilt = await readOutputs(desktopApp);
  expect(rebuilt.files.find((file) => file.article_id === ownerId)!.body).toBe(body);
  await desktopWindow.evaluate(async (id) => {
    const debug = window.__folioleWorkspaceDebug!;
    if (!await debug.deleteNode(id)) throw new Error('Expected PDF subtree in Trash');
    if (!await debug.deleteNodePermanently(id)) throw new Error('Expected PDF subtree deletion');
  }, chain.cloze);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === ownerId)!.body,
    { timeout: 90_000 }).not.toContain('Current PDF answer.');
  const deleted = await readOutputs(desktopApp);
  expect(deleted.files.find((file) => file.article_id === ownerId)!.body).toContain('Saved PDF excerpt.');
  expect(deleted.files.filter((file) => file.article_id !== ownerId)).toEqual(
    rebuilt.files.filter((file) => file.article_id !== ownerId));
  await testInfo.attach('pdf-text-output', {
    body: JSON.stringify({ ownerId, chain, before, after, rebuilt, deleted }, null, 2), contentType: 'application/json'
  });
});
