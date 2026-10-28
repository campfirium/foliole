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
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/nested-highlight-export.md`;
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
  const fixtureRoot = path.resolve('.tmp/artifacts/T513/2c');
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


async function createChain(page: Page, epub: boolean) {
  if (epub) {
    await page.evaluate(async () => {
      const debug = window.__folioleWorkspaceDebug!;
      await debug.openNode(debug.listNodes().find((node) => node.title === 'Chapter 1')!.id);
    });
    await expect(page.getByRole('main', { name: /Foliole workspace/ }))
      .toContainText('First chapter keeps the early remembered quote');
  }
  return page.evaluate(async (epub) => {
    const debug = window.__folioleWorkspaceDebug!;
    const owner = debug.listNodes().find((node) => node.title === (epub ? 'Manual Book' : 'Nested Topic'))!;
    const parent = epub ? debug.listNodes().find((node) => node.title === 'Chapter 1')! : owner;
    const source = epub ? 'First chapter' : 'Alpha';
    let parentId = parent.id;
    const ids: string[] = [];
    for (const note of ['First note.', 'Second note.', 'Initial deep note.']) {
      const content = debug.getNode(parentId)!.content;
      const from = content.indexOf(source);
      if (from < 0) throw new Error('Expected selection source');
      const id = await debug.createTextHighlightChild({ parentNodeId: parentId,
        text: `${source}\n※ ${note}`, anchorId: 'reused-per-parent',
        anchorLink: { id: 'reused-per-parent', kind: 'highlight',
          locator: { from, to: from + source.length, originalText: source } } });
      if (!id) throw new Error('Expected saved derived highlight');
      ids.push(id);
      parentId = id;
    }
    await debug.openNode(owner.id);
    await window.electronAPI!.invoke('rebuild_mirror_output');
    return { ownerId: owner.id, parentId: ids[1]!, deepId: ids[2]!, ids, source };
  }, epub);
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

for (const epub of [false, true]) {
  test(`keeps three saved derived highlight generations through every output path, epub=${epub}`, async ({
    desktopApp, desktopWindow
  }, testInfo) => {
    await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
    await desktopWindow.reload();
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
    await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.seedNodes([
      { id: 't513-nested-unrelated', title: 'Unrelated', kind: 'topic', content: 'Unrelated saved body.' },
      { id: 't513-nested-owner', title: 'Nested Topic', kind: 'topic', content: 'Alpha Beta Gamma' }
    ], { persist: true }));
    if (epub) await importBook(desktopApp, desktopWindow);
    const chain = await createChain(desktopWindow, epub);
    await settleInitialMirror(desktopApp);
    const before = await readOutputs(desktopApp);
    await desktopWindow.evaluate((chain) => window.electronAPI!.invoke('update_node_content', {
      nodeId: chain.deepId, parentNodeId: chain.parentId, kind: 'topic', title: 'Deep annotation',
      content: `${chain.source}\n※ Current deep note.`, reveal: null, isTitleManual: true, hideTitleHeading: false, position: 0,
      anchorLink: { id: 'reused-per-parent', kind: 'highlight', locator: { from: 0, to: chain.source.length, originalText: chain.source } },
      createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
    }), chain);
    await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === chain.ownerId)!.body,
      { timeout: 90_000 }).toContain('Current deep note.');
    const after = await readOutputs(desktopApp);
    const body = after.files.find((file) => file.article_id === chain.ownerId)!.body;
    for (const note of ['First note.', 'Second note.', 'Current deep note.']) expect(body.split(note)).toHaveLength(2);
    expect(body).not.toContain('Initial deep note.');
    if (epub) expect(body).toContain('Second chapter saves the later insight');
    expect(after.files.filter((file) => file.article_id !== chain.ownerId)).toEqual(
      before.files.filter((file) => file.article_id !== chain.ownerId));
    expect(after.files).toHaveLength(before.files.length);
    expect(after.files.some((file) => chain.ids.includes(file.article_id))).toBe(false);
    await exportFromPalette(desktopApp, desktopWindow, chain.ownerId, body);
    await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
    const rebuilt = await readOutputs(desktopApp);
    expect(rebuilt.files.find((file) => file.article_id === chain.ownerId)!.body).toBe(body);
    await desktopWindow.evaluate(async (id) => {
      await window.electronAPI!.invoke('soft_delete_nodes', { nodeIds: [id], deletedAt: new Date().toISOString() });
      await window.electronAPI!.invoke('delete_nodes_permanently', { nodeIds: [id] });
    }, chain.deepId);
    await expect.poll(async () => (await readOutputs(desktopApp)).files.find((file) => file.article_id === chain.ownerId)!.body,
      { timeout: 90_000 }).not.toContain('Current deep note.');
    const deleted = await readOutputs(desktopApp);
    expect(deleted.files.find((file) => file.article_id === chain.ownerId)!.body).toContain('Second note.');
    expect(deleted.files.filter((file) => file.article_id !== chain.ownerId)).toEqual(
      rebuilt.files.filter((file) => file.article_id !== chain.ownerId));
    await testInfo.attach('nested-highlight-output', {
      body: JSON.stringify({ chain, before, after, rebuilt, deleted }, null, 2), contentType: 'application/json'
    });
  });
}
