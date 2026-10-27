import type { Worker } from 'node:worker_threads';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

interface FailureState {
  started: boolean;
  release: () => void;
  cancel: () => void;
  done: boolean;
  error: string | null;
}
type TestGlobal = typeof globalThis & { __t513Failure: FailureState };

async function save(page: Page, content: string) {
  await page.evaluate(async (content) => {
    await window.electronAPI!.invoke('update_node_content', {
      nodeId: 't513-failure', parentNodeId: null, kind: 'topic', title: 'Failure recovery',
      content, reveal: null, anchorLink: null, isTitleManual: true, hideTitleHeading: false, position: 0,
      createdAt: '2026-04-08T00:00:00.000Z', updatedAt: new Date().toISOString()
    });
  }, content);
}

async function flush(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    try {
      await require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync();
      return null;
    } catch (error) {
      return String(error);
    }
  }, process.cwd());
}

async function output(app: ElectronApplication) {
  return app.evaluate(async (_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const fs = process.getBuiltinModule('fs')!;
    const path = process.getBuiltinModule('path')!;
    const connection = require(`${cwd}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const root = require(`${cwd}/dist/electron/ipc/libraryPaths.js`).loadLibraryPathSettingsSync().mirror;
      const record = connection.openDatabaseConnection().driver.queryOne(
        'SELECT relative_path, mirrored_at FROM mirror_articles WHERE article_id = ?', ['t513-failure']
      );
      const file = path.join(root, record.relative_path);
      return { record, file, body: fs.readFileSync(file, 'utf8'), mtime: fs.statSync(file).mtimeMs };
    });
  }, process.cwd());
}

async function initialize(page: Page, app: ElectronApplication) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([{
      id: 't513-failure', title: 'Failure recovery', kind: 'topic', content: 'Initial body'
    }], { persist: true });
    await window.electronAPI!.invoke('rebuild_mirror_output');
  });
  expect(await flush(app)).toBeNull();
}

test('retains failed OS writes until explicit retry and keeps the success record honest', async ({ desktopApp, desktopWindow }, testInfo) => {
  test.setTimeout(120_000);
  await initialize(desktopWindow, desktopApp);
  const before = await output(desktopApp);
  await desktopApp.evaluate((_, file) => process.getBuiltinModule('fs')!.chmodSync(file, 0o400), before.file);
  try {
    await save(desktopWindow, 'Saved body after failure');
    expect(await flush(desktopApp)).toContain('EACCES');
    expect(await output(desktopApp)).toEqual(before);
  } finally {
    await desktopApp.evaluate((_, file) => process.getBuiltinModule('fs')!.chmodSync(file, 0o600), before.file);
  }
  await new Promise((resolve) => setTimeout(resolve, 65_000));
  expect(await output(desktopApp)).toEqual(before);
  expect(await flush(desktopApp)).toBeNull();
  const after = await output(desktopApp);
  expect(after.body).toContain('Saved body after failure');
  expect(after.record.mirrored_at).not.toEqual(before.record.mirrored_at);
  await testInfo.attach('write-failure-recovery', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
});

test('keeps a newer real save pending when a rendered task is cancelled before commit', async ({ desktopApp, desktopWindow }, testInfo) => {
  await initialize(desktopWindow, desktopApp);
  const before = await output(desktopApp);
  await desktopApp.evaluate((_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const { Worker } = require('node:worker_threads') as typeof import('node:worker_threads');
    const { desktopTaskScheduler: scheduler } = require(`${cwd}/dist/electron/desktopTaskScheduler.js`) as typeof import('../../electron/desktopTaskScheduler');
    const state: FailureState = { started: false, release: () => {}, cancel: () => {}, done: false, error: null };
    (globalThis as TestGlobal).__t513Failure = state;
    const submit = scheduler.submit;
    scheduler.submit = (...args: Parameters<typeof submit>) => {
      const task = Reflect.apply(submit, scheduler, args);
      if (args[0].id === 'mirror-incremental') {
        state.cancel = task.cancel;
        scheduler.submit = submit;
      }
      return task;
    };
    const emit = Worker.prototype.emit;
    Worker.prototype.emit = function (this: Worker, event: string | symbol, ...args: unknown[]) {
      if (event === 'exit' && args[0] === 0) {
        Worker.prototype.emit = emit;
        state.started = true;
        state.release = () => {
          Reflect.apply(emit, this, [event, ...args]);
          state.cancel();
        };
        return true;
      }
      return Reflect.apply(emit, this, [event, ...args]);
    };
  }, process.cwd());
  await save(desktopWindow, 'V1 body');
  await desktopApp.evaluate((_, cwd) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${cwd}/package.json`);
    const state = (globalThis as TestGlobal).__t513Failure;
    void require(`${cwd}/dist/electron/mirror/mirrorSyncScheduler.js`).flushMirrorSync()
      .catch((error: unknown) => { state.error = String(error); }).finally(() => { state.done = true; });
  }, process.cwd());
  await expect.poll(() => desktopApp.evaluate(() => (globalThis as TestGlobal).__t513Failure.started)).toBe(true);
  await save(desktopWindow, 'V2 final body');
  await desktopApp.evaluate(() => (globalThis as TestGlobal).__t513Failure.release());
  await expect.poll(() => desktopApp.evaluate(() => (globalThis as TestGlobal).__t513Failure.done)).toBe(true);
  expect(await output(desktopApp)).toEqual(before);
  expect(await flush(desktopApp)).toBeNull();
  const after = await output(desktopApp);
  expect(after.body).toContain('V2 final body');
  expect(after.body).not.toContain('V1 body');
  await testInfo.attach('cancel-newer-save', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
});
