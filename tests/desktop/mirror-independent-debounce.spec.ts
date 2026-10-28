import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function readOutputs(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const fs = process.getBuiltinModule('fs')!;
    const path = process.getBuiltinModule('path')!;
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const root = require(`${cwd}/dist/electron/ipc/libraryPaths.js`).loadLibraryPathSettingsSync().mirror;
      const records = connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id LIKE 't513-debounce-%' ORDER BY article_id"
      ) as Array<{ article_id: string; relative_path: string; mirrored_at: string }>;
      return records.map((record) => {
        const file = path.join(root, record.relative_path);
        return { ...record, body: fs.readFileSync(file, 'utf8'), mtime: fs.statSync(file).mtimeMs };
      });
    });
  }, process.cwd());
}

function fileFacts(records: Awaited<ReturnType<typeof readOutputs>>) {
  return records.map(({ article_id, body, mtime, relative_path }) => ({ article_id, body, mtime, relative_path }));
}

async function save(page: Page, id: string, content: string, parent: string | null = null) {
  return page.evaluate(async ({ id, content, parent }) => {
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: `t513-debounce-${id}`, parentNodeId: parent, kind: 'topic', title: id,
      content, reveal: null, anchorLink: null, isTitleManual: true, hideTitleHeading: false, position: 0,
      createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
    });
    return Date.now();
  }, { id, content, parent });
}

async function waitUntil(timestamp: number) {
  const remaining = timestamp - Date.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

async function exportMovedArticle(app: ElectronApplication) {
  return app.evaluate(async ({ dialog }, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const fs = process.getBuiltinModule('fs')!;
    const filePath = `${process.env.FOLIOLE_LIBRARY_HOME!}/joint-export.md`;
    const original = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    try {
      const result = await require(`${cwd}/dist/electron/mirror/exportCurrentArticleMirror.js`)
        .exportCurrentArticleMirror('t513-debounce-A', null);
      return { result, body: fs.readFileSync(filePath, 'utf8') };
    } finally { dialog.showSaveDialog = original; }
  }, process.cwd());
}

test('keeps independent deadlines across real saves and a moved article, with matching exports', async ({ desktopApp, desktopWindow }, testInfo) => {
  test.setTimeout(180_000);
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([{
      id: 't513-debounce-destination', title: 'Destination', kind: 'folder', content: ''
    }, ...['A', 'B', 'Unrelated'].map((id) => ({
      id: `t513-debounce-${id}`, title: id, kind: 'topic' as const, content: `Initial ${id}`
    }))], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  await desktopApp.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    await require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
  }, process.cwd());
  const before = await readOutputs(desktopApp);
  const a0 = await save(desktopWindow, 'A', 'A first saved body');
  await waitUntil(a0 + 20_000);
  const b = await save(desktopWindow, 'B', 'B final saved body');
  await waitUntil(a0 + 40_000);
  expect(await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.moveNodes(
    ['t513-debounce-A'], 't513-debounce-destination', 'child'))).toBe(true);
  const a = await save(desktopWindow, 'A', 'A final saved body', 't513-debounce-destination');
  await waitUntil(b + 59_000);
  expect(fileFacts(await readOutputs(desktopApp))).toEqual(fileFacts(before));
  await expect.poll(async () => (await readOutputs(desktopApp)).find((file) => file.article_id.endsWith('-B'))!.body,
    { timeout: 10_000, intervals: [100] }).toContain('B final saved body');
  const afterB = await readOutputs(desktopApp);
  expect(afterB.find((file) => file.article_id.endsWith('-A'))).toEqual(before.find((file) => file.article_id.endsWith('-A')));
  await waitUntil(a + 59_000);
  expect((await readOutputs(desktopApp)).find((file) => file.article_id.endsWith('-A')))
    .toEqual(before.find((file) => file.article_id.endsWith('-A')));
  await expect.poll(async () => (await readOutputs(desktopApp)).find((file) => file.article_id.endsWith('-A'))!.body,
    { timeout: 10_000, intervals: [100] }).toContain('A final saved body');
  const afterA = await readOutputs(desktopApp);
  expect(fileFacts(afterA.filter((file) => file.article_id.endsWith('-Unrelated'))))
    .toEqual(fileFacts(before.filter((file) => file.article_id.endsWith('-Unrelated'))));
  expect(Date.parse(afterB.find((file) => file.article_id.endsWith('-B'))!.mirrored_at)).toBeGreaterThanOrEqual(b + 59_900);
  expect(Date.parse(afterA.find((file) => file.article_id.endsWith('-A'))!.mirrored_at)).toBeGreaterThanOrEqual(a + 59_900);
  expect(afterA.find((file) => file.article_id.endsWith('-A'))!.relative_path).toBe('Destination/A.md');
  const exported = await exportMovedArticle(desktopApp);
  expect(exported.result.status).toBe('saved');
  expect(exported.body).toBe(afterA.find((file) => file.article_id.endsWith('-A'))!.body);
  await desktopWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
  const rebuilt = await readOutputs(desktopApp);
  expect(rebuilt.map(({ article_id, body, relative_path }) => ({ article_id, body, relative_path })))
    .toEqual(afterA.map(({ article_id, body, relative_path }) => ({ article_id, body, relative_path })));
  expect(await desktopApp.evaluate((_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const root = require(`${cwd}/dist/electron/ipc/libraryPaths.js`).loadLibraryPathSettingsSync().mirror;
    return process.getBuiltinModule('fs')!.existsSync(`${root}/A.md`);
  }, process.cwd())).toBe(false);
  await testInfo.attach('independent-debounce', { body: JSON.stringify({ a0, b, a, before, afterB, afterA, exported, rebuilt }, null, 2),
    contentType: 'application/json' });
});
