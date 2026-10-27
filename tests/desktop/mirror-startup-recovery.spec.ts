import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import type { DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type Row = { article_id: string; relative_path: string; mirrored_at: string };
type Output = { database: string; root: string; rows: Row[] };
const prefix = 't513-startup-';
const sourceTime = '2020-01-01T00:00:00.000Z';

async function save(page: Page, suffix: string, content: string, updatedAt = new Date().toISOString()) {
  await page.evaluate(async ({ id, content, sourceTime, updatedAt }) => {
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: id, parentNodeId: null, kind: 'topic', title: id, content,
      reveal: null, anchorLink: null, isTitleManual: true, hideTitleHeading: false, position: 0,
      createdAt: sourceTime, updatedAt
    });
  }, { id: `${prefix}${suffix}`, content, sourceTime, updatedAt });
}

async function metadata(app: ElectronApplication): Promise<Output> {
  return app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => ({
      database: connection.resolveDatabasePath(),
      root: require(`${cwd}/dist/electron/ipc/libraryPaths.js`).loadLibraryPathSettingsSync().mirror,
      rows: connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id LIKE 't513-startup-%' ORDER BY article_id")
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
    const rows = db.prepare("SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id LIKE 't513-startup-%' ORDER BY article_id")
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

async function document(page: Page, suffix: string) {
  return page.evaluate(async (nodeId) => window.electronAPI!.invoke('load_node_document', { nodeId }), `${prefix}${suffix}`);
}

async function waitUntil(page: Page, time: number) {
  await page.waitForTimeout(Math.max(0, time - Date.now()));
}

async function read(output: Output, suffix: string) {
  const row = output.rows.find((row) => row.article_id === `${prefix}${suffix}`);
  return row ? fs.readFile(path.join(output.root, row.relative_path), 'utf8') : null;
}

async function forceQuit(first: DesktopSession) {
  const closed = first.electronApp.waitForEvent('close');
  expect(first.electronApp.process().kill('SIGKILL')).toBe(true);
  await closed;
}

async function initialize(first: DesktopSession) {
  await expectWorkspaceShell(first.firstWindow);
  await joinStartup(first.electronApp);
  await save(first.firstWindow, 'A', 'A original', sourceTime);
  await save(first.firstWindow, 'unrelated', 'Unrelated original', sourceTime);
  await first.firstWindow.evaluate(() => window.electronAPI!.invoke('rebuild_mirror_output'));
  await first.electronApp.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    await require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
  }, process.cwd());
}

test('force-quit startup waits sixty seconds per node and new edits postpone only their own output', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(160_000);
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: testInfo.outputPath('state') };
  const first = await launchDesktopSession({ env }) as DesktopSession;
  let second: DesktopSession | undefined;
  try {
    await initialize(first);
    const before = await metadata(first.electronApp);
    const beforeFiles = await files(before);
    const unrelated = before.rows.find((row) => row.article_id === `${prefix}unrelated`)!;
    const unrelatedMtime = (await fs.stat(path.join(before.root, unrelated.relative_path))).mtimeMs;
    await save(first.firstWindow, 'A', 'A saved before force quit');
    await save(first.firstWindow, 'B', 'B saved without a mirror');
    const savedA = await document(first.firstWindow, 'A');
    const savedB = await document(first.firstWindow, 'B');
    await forceQuit(first);
    expect(await stoppedOutput(before)).toEqual(beforeFiles);
    const startedAt = Date.now();
    second = await launchDesktopSession({ env }) as DesktopSession;
    await expectWorkspaceShell(second.firstWindow);
    await joinStartup(second.electronApp);
    const joinedAt = Date.now();
    expect(joinedAt - startedAt).toBeLessThan(20_000);
    expect(await document(second.firstWindow, 'A')).toEqual(savedA);
    expect(await document(second.firstWindow, 'B')).toEqual(savedB);
    expect(await files(await metadata(second.electronApp))).toEqual(beforeFiles);
    await waitUntil(second.firstWindow, joinedAt + 20_000);
    await save(second.firstWindow, 'A', 'A latest after reopening');
    const editedAt = Date.now();
    await waitUntil(second.firstWindow, startedAt + 58_000);
    const beforeExpiry = await metadata(second.electronApp);
    expect(await read(beforeExpiry, 'A')).toContain('A original');
    expect(await read(beforeExpiry, 'B')).toBeNull();
    await expect.poll(async () => read(await metadata(second!.electronApp), 'B'), {
      timeout: 25_000, intervals: [250]
    }).toContain('B saved without a mirror');
    const bCompletedAt = Date.now();
    expect(bCompletedAt - startedAt).toBeGreaterThanOrEqual(60_000);
    expect(await read(await metadata(second.electronApp), 'A')).toContain('A original');
    await waitUntil(second.firstWindow, editedAt + 58_000);
    expect(await read(await metadata(second.electronApp), 'A')).toContain('A original');
    await expect.poll(async () => read(await metadata(second!.electronApp), 'A'), {
      timeout: 15_000, intervals: [250]
    }).toContain('A latest after reopening');
    const completedAt = Date.now();
    expect(completedAt - editedAt).toBeGreaterThanOrEqual(59_900);
    const after = await metadata(second.electronApp);
    expect((await document(second.firstWindow, 'A'))!.content).toBe('A latest after reopening');
    expect(await read(after, 'unrelated')).toBe(await read(before, 'unrelated'));
    expect((await fs.stat(path.join(before.root, unrelated.relative_path))).mtimeMs).toBe(unrelatedMtime);
    await testInfo.attach('startup-independent-real-time', { contentType: 'application/json',
      body: JSON.stringify({ startedAt, joinedAt, editedAt, bCompletedAt, completedAt,
        beforeFiles, beforeExpiry, after: await files(after), savedA, savedB }, null, 2) });
  } finally {
    await second?.close();
    await first.close();
  }
});
