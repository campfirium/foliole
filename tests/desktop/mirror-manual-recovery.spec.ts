import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import type { DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

type Row = { article_id: string; relative_path: string; mirrored_at: string };
type Output = { database: string; root: string; rows: Row[] };
const prefix = 't513-recovery-';
const sourceTime = '2020-01-01T00:00:00.000Z';

async function save(page: Page, suffix: string, content: string) {
  await page.evaluate(async ({ id, content, sourceTime }) => {
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: id, parentNodeId: null, kind: 'topic', title: id, content,
      reveal: null, anchorLink: null, isTitleManual: true, hideTitleHeading: false, position: 0,
      createdAt: sourceTime, updatedAt: sourceTime
    });
  }, { id: `${prefix}${suffix}`, content, sourceTime });
}

async function metadata(app: ElectronApplication): Promise<Output> {
  return app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => ({
      database: connection.resolveDatabasePath(),
      root: require(`${cwd}/dist/electron/ipc/libraryPaths.js`).loadLibraryPathSettingsSync().mirror,
      rows: connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id LIKE 't513-recovery-%' ORDER BY article_id")
    }));
  }, process.cwd());
}

async function files(output: Output) {
  return Promise.all(output.rows.map(async (row) => ({
    ...row, body: await fs.readFile(path.join(output.root, row.relative_path), 'utf8')
  })));
}

async function stoppedOutput(output: Output) {
  const db = new DatabaseSync(output.database, { readOnly: true });
  try {
    const rows = db.prepare("SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id LIKE 't513-recovery-%' ORDER BY article_id")
      .all() as Row[];
    return files({ ...output, rows });
  } finally { db.close(); }
}

async function joinStartup(app: ElectronApplication) {
  await app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    await require(`${cwd}/dist/electron/desktopOperations.js`).submitDesktopOperation('mirror-backfill', {
      run: async () => {}
    }).promise;
  }, process.cwd());
}

async function initialize(session: DesktopSession) {
  const page = session.firstWindow;
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await joinStartup(session.electronApp);
  for (const suffix of ['older', 'deleted', 'unrelated']) await save(page, suffix, 'Alpha original source');
  const child = await page.evaluate(async (prefix) => {
    const debug = window.__folioleWorkspaceDebug!;
    // Refresh renderer metadata after the formal save commands before creating the derived child.
    await debug.seedNodes([{ id: `${prefix}deleted`, title: `${prefix}deleted`, kind: 'topic',
      content: 'Alpha original source' }], { persist: true });
    return debug.createTextHighlightChild({ parentNodeId: `${prefix}deleted`,
      text: 'Alpha\n※ Retired child note.', anchorId: 'recovery-anchor',
      anchorLink: { id: 'recovery-anchor', kind: 'highlight', locator: { from: 0, to: 5, originalText: 'Alpha' } } });
  }, prefix);
  expect(child).toBeTruthy();
  // Keep the unchanged owner's date older than the successful mirror record.
  await save(page, 'deleted', 'Alpha original source');
  await page.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
  await session.electronApp.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    await require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
  }, process.cwd());
  return child!;
}

async function document(page: Page, suffix: string) {
  return page.evaluate(async (nodeId) => window.electronAPI!.invoke('load_node_document', { nodeId }), `${prefix}${suffix}`);
}

async function rebuildAndVerify(session: DesktopSession, beforeFiles: Awaited<ReturnType<typeof files>>, savedContent: string, stale: string, outside: string) {
  // Exercise the user-facing settings button, including renderer bridge and real worker generation.
  const settings = await openSettingsDialog(session.firstWindow);
  await settings.getByRole('button', { name: /^(Storage|存储)$/ }).click();
  await settings.getByRole('button', { name: /^(Rebuild mirror|重建镜像)$/ }).click();
  await expect(settings.getByText(/^Rebuilt \d+ mirror article files from \d+ queued articles\.$/)).toBeVisible();
  const afterManual = await files(await metadata(session.electronApp));
  expect(afterManual.find((row) => row.article_id === `${prefix}older`)!.body).toContain(savedContent);
  const cleaned = afterManual.find((row) => row.article_id === `${prefix}deleted`)!;
  expect(cleaned.body).toContain('Alpha original source');
  expect(cleaned.body).not.toContain('Retired child note.');
  expect(afterManual.find((row) => row.article_id === `${prefix}missing`)!.body).toContain('Saved before any mirror exists.');
  expect(afterManual.find((row) => row.article_id === `${prefix}unrelated`)!.body)
    .toBe(beforeFiles.find((row) => row.article_id === `${prefix}unrelated`)!.body);
  await expect(fs.access(stale)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await fs.readFile(outside, 'utf8')).toBe('Protected outside mirror');
  return afterManual;
}

test('manual rebuild recovers current SQLite facts after an isolated force quit and reopen', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('state') };
  const first = await launchDesktopSession({ env }) as DesktopSession;
  let second: DesktopSession | undefined;
  try {
    const child = await initialize(first);
    const before = await metadata(first.electronApp);
    const beforeFiles = await files(before);
    const unchangedOwner = await document(first.firstWindow, 'deleted');
    await save(first.firstWindow, 'older', 'Current SQLite body with an older source date.');
    await save(first.firstWindow, 'missing', 'Saved before any mirror exists.');
    await first.firstWindow.evaluate(async (nodeId) => {
      await window.electronAPI!.invoke('soft_delete_nodes', { nodeIds: [nodeId], deletedAt: new Date().toISOString() });
      await window.electronAPI!.invoke('delete_nodes_permanently', { nodeIds: [nodeId] });
    }, child);
    expect(await document(first.firstWindow, 'deleted')).toEqual(unchangedOwner);
    const savedOlder = await document(first.firstWindow, 'older');
    expect(savedOlder!.content).toBe('Current SQLite body with an older source date.');
    const closed = first.electronApp.waitForEvent('close');
    expect(first.electronApp.process().kill('SIGKILL')).toBe(true);
    await closed;
    // Read the stopped isolated database before startup can repair missing files.
    const afterCrash = await stoppedOutput(before);
    expect(afterCrash).toEqual(beforeFiles);
    expect(afterCrash.some((row) => row.article_id === `${prefix}missing`)).toBe(false);
    const stale = path.join(before.root, 'retired', 'stale.md');
    const outside = path.join(path.dirname(before.root), 'outside-mirror.md');
    await fs.mkdir(path.dirname(stale), { recursive: true });
    await fs.writeFile(stale, 'Retired mirror output');
    await fs.writeFile(outside, 'Protected outside mirror');
    second = await launchDesktopSession({ env }) as DesktopSession;
    await expectWorkspaceShell(second.firstWindow);
    await joinStartup(second.electronApp);
    expect(await document(second.firstWindow, 'older')).toEqual(savedOlder);
    expect(await document(second.firstWindow, 'deleted')).toEqual(unchangedOwner);
    const beforeManual = await files(await metadata(second.electronApp));
    expect(beforeManual.find((row) => row.article_id === `${prefix}older`)!.body).toContain('original source');
    expect(beforeManual.find((row) => row.article_id === `${prefix}deleted`)!.body).toContain('Retired child note.');
    const afterManual = await rebuildAndVerify(second, beforeFiles, savedOlder!.content, stale, outside);
    await testInfo.attach('force-quit-reopen-manual-rebuild', {
      body: JSON.stringify({ before: beforeFiles, afterCrash, beforeManual, afterManual, savedOlder, unchangedOwner }, null, 2),
      contentType: 'application/json'
    });
  } finally {
    await second?.close();
    await first.close();
  }
});
