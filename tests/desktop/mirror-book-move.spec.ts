import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { createMultiChapterBookEpub } from '../../electron/import/readwiseBooksEndToEnd.fixture';


import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

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
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/moved-book-export.md`;
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

async function importBook(desktopApp: ElectronApplication, desktopWindow: Page) {
  const fixtureRoot = path.resolve('.tmp/artifacts/T513/1k-c');
  await fs.mkdir(fixtureRoot, { recursive: true });
  const fixturePath = await createMultiChapterBookEpub(fixtureRoot, 'book.epub');
  await desktopApp.evaluate(({ dialog }, file) => {
    const original = dialog.showOpenDialog;
    (globalThis as unknown as { restoreBookDialog: () => void }).restoreBookDialog = () => { dialog.showOpenDialog = original; };
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, fixturePath);
  try {
    await desktopWindow.getByRole('button', { name: 'Import', exact: true }).click();
    const mode = desktopWindow.getByRole('dialog', { name: 'Choose reading mode' });
    await mode.getByRole('button', { name: /^Free reading/ }).click();
    await expect(mode).toBeHidden();
    await expect.poll(() => desktopWindow.evaluate(() =>
      window.__folioleWorkspaceDebug!.listNodes().some((node) => node.title === 'Chapter 1'))).toBe(true);
  } finally {
    await desktopApp.evaluate(() => (globalThis as unknown as { restoreBookDialog: () => void }).restoreBookDialog());
  }
}

async function seedChapterNote(desktopWindow: Page) {
  const chapterId = await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug!.listNodes().find((node) => node.title === 'Chapter 1')!.id);
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), chapterId);
  await expect(desktopWindow.getByRole('main', { name: /Foliole workspace/ }))
    .toContainText('First chapter keeps the early remembered quote');
  return desktopWindow.evaluate(async () => {
    const debug = window.__folioleWorkspaceDebug!;
    const root = debug.listNodes().find((node) => node.title === 'Manual Book')!;
    const chapter = debug.listNodes().find((node) => node.title === 'Chapter 1')!;
    const content = debug.getNode(chapter.id)!.content;
    const from = content.indexOf('First chapter');
    const anchorLink = { id: 'chapter-highlight', kind: 'highlight' as const,
      locator: { from, to: from + 13, originalText: 'First chapter' } };
    const noteId = await debug.createTextHighlightChild({ parentNodeId: chapter.id,
      text: 'Initial annotation.', anchorId: 'chapter-highlight', anchorLink });
    if (!noteId) throw new Error('Chapter annotation was not created');
    await debug.openNode(chapter.id);
    await window.electronAPI!.invoke('rebuild_mirror_output');
    return { rootId: root.id, chapterId: chapter.id, noteId, anchorLink };
  });
}

async function prepareBook(desktopApp: ElectronApplication, desktopWindow: Page) {
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.seedNodes([
    { id: 't513-book-old', title: 'Old', kind: 'folder', content: '' },
    { id: 't513-book-folder', title: 'Destination', kind: 'folder', content: '' },
    { id: 't513-book-parent', title: 'Parent', kind: 'topic', content: 'Parent saved body.' },
    { id: 't513-book-child', title: 'Independent', kind: 'topic', content: 'Independent saved body.' },
    { id: 't513-book-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' }
  ], { persist: true }));
  await importBook(desktopApp, desktopWindow);
  const book = await seedChapterNote(desktopWindow);
  expect(await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.moveNodes(
    ['t513-book-child'], id, 'child'), book.rootId)).toBe(true);
  expect(await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.moveNodes(
    [id], 't513-book-old', 'child'), book.rootId)).toBe(true);
  await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
  await settleInitialMirror(desktopApp);
  return book;
}

for (const target of ['t513-book-folder', 't513-book-parent', 'special-inbox'] as const) {
test(`moves a real book root to ${target} with independent descendants and matching exports`, async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const book = await prepareBook(desktopApp, desktopWindow);
  const before = await readOutputs(desktopApp);
  const beforeBook = before.files.find((file) => file.article_id === book.rootId)!;
  expect(beforeBook.relative_path).toBe('Old/Manual Book.md');
  expect(beforeBook.body).toContain('Initial annotation.');
  expect(before.files.some((file) => file.article_id === book.chapterId)).toBe(false);
  expect(await desktopWindow.evaluate(({ id, target }) => window.__folioleWorkspaceDebug!.moveNodes(
    [id], target, 'child'), { id: book.rootId, target })).toBe(true);
  const prefix = target === 't513-book-folder' ? 'Destination/' : target === 'special-inbox' ? 'Inbox/' : '';
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === book.rootId)!.relative_path,
    { timeout: 90_000 }).toBe(`${prefix}Manual Book.md`);
  await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === 't513-book-child')!.relative_path,
    { timeout: 90_000 }).toBe(`${prefix}Independent.md`);
  const after = await readOutputs(desktopApp);
  expect(after.names).not.toContain('Old');
  expect(after.files.find((file) => file.article_id === 't513-book-child')!.body).toContain('Independent saved body.');
  const afterBook = after.files.find((file) => file.article_id === book.rootId)!;
  expect(after.files.filter((file) => ![book.rootId, 't513-book-child'].includes(file.article_id))).toEqual(
    before.files.filter((file) => ![book.rootId, 't513-book-child'].includes(file.article_id)));
  const output = await configureTopicExportDialog(desktopApp);
  try {
    await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug!.openNode(id), book.chapterId);
    await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
    const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
    await palette.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill('export');
    await palette.screenshot({ path: `.tmp/artifacts/T513/1k-c/${target}-export-palette.png` });
    await palette.getByRole('button', { name: /^(Export Current Topic|导出当前主题)$/ }).click();
    await expect.poll(() => desktopApp.evaluate((_, file) => {
      const fsApi = process.getBuiltinModule('fs')!;
      return fsApi.existsSync(file) ? fsApi.readFileSync(file, 'utf8') : null;
    }, output)).toBe(afterBook.body);
    const body = await desktopApp.evaluate((_, file) => process.getBuiltinModule('fs')!.readFileSync(file, 'utf8'), output);
    expect(body).toBe(afterBook.body);
    await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
    const rebuilt = await readOutputs(desktopApp);
    expect(rebuilt.files.find((file) => file.article_id === book.rootId)!.body).toBe(body);
    expect(rebuilt.files).toHaveLength(before.files.length);
    expect(afterBook.body).toBe(beforeBook.body);
    expect(after.files.some((file) => file.article_id === book.chapterId)).toBe(false);
    await testInfo.attach('epub-book-output', {
      body: JSON.stringify({ before, after, rebuilt, output }, null, 2), contentType: 'application/json'
    });
  } finally {
    await desktopApp.evaluate(() => (globalThis as unknown as { restoreTopicDialog: () => void }).restoreTopicDialog());
  }
});
}
