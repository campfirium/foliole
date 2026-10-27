import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Worker } from 'node:worker_threads';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import type { DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type QuitGlobal = typeof globalThis & { __t513Quit: { held: number; release: () => void } };
type Output = { database: string; root: string; rows: { article_id: string; relative_path: string; mirrored_at: string }[] };

async function save(page: Page, id: string, content: string) {
  await page.evaluate(async ({ id, content }) => {
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: id, parentNodeId: null, kind: 'topic', title: id, content,
      reveal: null, anchorLink: null, isTitleManual: true, hideTitleHeading: false, position: 0,
      createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
    });
  }, { id, content });
}

async function flush(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    try {
      await require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
      return null;
    } catch (error) { return String(error); }
  }, process.cwd());
}

async function metadata(app: ElectronApplication): Promise<Output> {
  return app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => ({
      database: connection.resolveDatabasePath(),
      root: require(`${cwd}/dist/electron/ipc/libraryPaths.js`).loadLibraryPathSettingsSync().mirror,
      rows: connection.openDatabaseConnection().driver.queryAll(
        "SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id LIKE 't513-quit-%' ORDER BY article_id")
    }));
  }, process.cwd());
}

async function files(output: Output) {
  return Promise.all(output.rows.map(async (row) => {
    const file = path.join(output.root, row.relative_path);
    return { ...row, body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs };
  }));
}

async function offline(output: Output) {
  const db = new DatabaseSync(output.database, { readOnly: true });
  try {
    const rows = db.prepare("SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id LIKE 't513-quit-%' ORDER BY article_id").all() as Output['rows'];
    return await files({ ...output, rows });
  } finally { db.close(); }
}

async function initialize(session: DesktopSession) {
  await expectWorkspaceShell(session.firstWindow);
  await session.firstWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await session.electronApp.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    // Join startup recovery before seeding so its coalesced handle cannot hide pending seed work.
    await require(`${cwd}/dist/electron/desktopOperations.js`).submitDesktopOperation('mirror-backfill', {
      run: async () => {}
    }).promise;
  }, process.cwd());
  await session.firstWindow.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes(['a', 'b', 'unrelated'].map((suffix) => ({
      id: `t513-quit-${suffix}`, title: `t513-quit-${suffix}`, kind: 'topic' as const, content: 'Initial body'
    })), { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  expect(await flush(session.electronApp)).toBeNull();
}

async function quit(app: ElectronApplication) {
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app }) => { setImmediate(() => app.quit()); });
  return closed;
}

async function holdFiveRenders(app: ElectronApplication) {
  await app.evaluate((_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const { Worker } = require('node:worker_threads') as typeof import('node:worker_threads');
    const state = { held: 0, release: () => {} };
    (globalThis as QuitGlobal).__t513Quit = state;
    const emit = Worker.prototype.emit;
    Worker.prototype.emit = function (this: Worker, event: string | symbol, ...args: unknown[]) {
      if (event === 'exit' && args[0] === 0 && state.held < 5) {
        state.held += 1;
        const listeners = this.rawListeners(event);
        // Worker removes exit listeners after emit returns; retain the actual callbacks for delayed delivery.
        state.release = () => { for (const listener of listeners) Reflect.apply(listener, this, args); };
        if (state.held === 5) Worker.prototype.emit = emit;
        return true;
      }
      return Reflect.apply(emit, this, [event, ...args]);
    };
  }, process.cwd());
}

async function quitPendingAndFailed(session: DesktopSession, before: Output) {
  const failedFile = path.join(before.root, before.rows.find((row) => row.article_id === 't513-quit-b')!.relative_path);
  await fs.chmod(failedFile, 0o400);
  try {
    await save(session.firstWindow, 't513-quit-b', 'Recovered failure at quit');
    expect(await flush(session.electronApp)).toContain('EACCES');
  } finally { await fs.chmod(failedFile, 0o600); }
  await save(session.firstWindow, 't513-quit-a', 'Not due when quitting');
  await quit(session.electronApp);
}

async function quitDuringSaves(session: DesktopSession, startup: boolean) {
  await holdFiveRenders(session.electronApp);
  await save(session.firstWindow, 't513-quit-a', 'Version 1');
  await session.electronApp.evaluate((_, { cwd, startup }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    if (startup) {
      void require(`${cwd}/dist/electron/desktopOperations.js`).submitDesktopOperation('mirror-backfill', {
        run: require(`${cwd}/dist/electron/mirror/rebuildMirrorOutput.js`).resumePendingMirrorOutput
      }).promise;
    } else void require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
  }, { cwd: process.cwd(), startup });
  await expect.poll(() => session.electronApp.evaluate(() => (globalThis as QuitGlobal).__t513Quit.held)).toBe(1);
  const closed = session.electronApp.waitForEvent('close');
  await session.electronApp.evaluate(({ app }) => { setImmediate(() => app.quit()); });
  for (let held = 1; held <= 5; held += 1) {
    await expect.poll(() => session.electronApp.evaluate(() => (globalThis as QuitGlobal).__t513Quit.held)).toBe(held);
    await save(session.firstWindow, 't513-quit-a', `Version ${held + 1}`);
    if (held === 5) await save(session.firstWindow, 't513-quit-b', 'Saved during final quit render');
    await session.electronApp.evaluate(() => (globalThis as QuitGlobal).__t513Quit.release());
  }
  await closed;
}

for (const mode of ['pending-and-failed', 'rendering-and-new-saves', 'startup-rendering'] as const) {
  test(`normal quit settles ${mode} before reopening`, async ({ browserName }, testInfo) => {
    void browserName;
    test.setTimeout(120_000);
    const stateRoot = testInfo.outputPath('state');
    const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot };
    const first = await launchDesktopSession({ env }) as DesktopSession;
    let second: DesktopSession | undefined;
    try {
      await initialize(first);
      const before = await metadata(first.electronApp);
      const beforeFiles = await files(before);
      if (mode === 'pending-and-failed') await quitPendingAndFailed(first, before);
      else await quitDuringSaves(first, mode === 'startup-rendering');
      // Inspect the stopped isolated library before startup can perform any recovery.
      const after = await offline(before);
      expect(after.find((row) => row.article_id === 't513-quit-a')!.body).toContain(
        mode === 'pending-and-failed' ? 'Not due when quitting' : 'Version 6');
      expect(after.find((row) => row.article_id === 't513-quit-b')!.body).toContain(
        mode === 'pending-and-failed' ? 'Recovered failure at quit' : 'Saved during final quit render');
      expect(after.find((row) => row.article_id === 't513-quit-unrelated')).toEqual(
        beforeFiles.find((row) => row.article_id === 't513-quit-unrelated'));
      for (const id of ['t513-quit-a', 't513-quit-b']) {
        expect(after.find((row) => row.article_id === id)!.mirrored_at).not.toEqual(
          before.rows.find((row) => row.article_id === id)!.mirrored_at);
      }
      second = await launchDesktopSession({ env }) as DesktopSession;
      await expectWorkspaceShell(second.firstWindow);
      const reopened = await files(await metadata(second.electronApp));
      expect(reopened.map((row) => row.body)).toEqual(after.map((row) => row.body));
      for (const id of ['t513-quit-a', 't513-quit-b']) {
        const document = await second.firstWindow.evaluate(async (nodeId) =>
          window.electronAPI!.invoke('load_node_document', { nodeId }), id);
        expect(reopened.find((row) => row.article_id === id)!.body).toContain(document!.content);
      }
      await testInfo.attach('quit-before-startup-and-reopened', {
        body: JSON.stringify({ mode, before: beforeFiles, after, reopened }, null, 2), contentType: 'application/json'
      });
    } finally {
      await second?.close();
      await first.close();
    }
  });
}
