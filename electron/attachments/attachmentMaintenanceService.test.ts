// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
const parsing = vi.hoisted(() => ({ calls: 0, beforePublish: undefined as undefined | (() => void) }));
vi.mock('./attachmentReferenceWorkerClient.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./attachmentReferenceWorkerClient.js')>();
  return { ...actual, runAttachmentReferenceWorker: (databasePath, publish, signal) =>
    actual.runAttachmentReferenceWorker(databasePath, async rows => {
      parsing.beforePublish?.();
      await publish(rows);
    }, signal) } as typeof actual;
});
vi.mock('../../lib/core/import/replaceArticleImageSource.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/core/import/replaceArticleImageSource.js')>();
  return { ...actual, collectArticleImageStorageKeys(content: string) {
    parsing.calls++;
    return actual.collectArticleImageStorageKeys(content);
  } };
});
vi.mock('node:worker_threads', async importOriginal => {
  const actual = await importOriginal<typeof import('node:worker_threads')>();
  return { ...actual, Worker: class extends actual.Worker {
    constructor(url: URL, options: import('node:worker_threads').WorkerOptions) {
      // Vitest loads host sources; execute the same worker from the normal Electron compilation.
      super(url.pathname.endsWith('/attachmentReferenceWorker.js')
        ? path.resolve('dist/electron/attachments/attachmentReferenceWorker.js') : url, options);
    }
  } };
});
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: appData,
  app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs') }) }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { withAttachmentFileLease } from './attachmentFileLease.js';
import { runDesktopAttachmentMaintenance } from './attachmentMaintenanceService.js';
import { moveAttachmentToTrash } from './attachmentTrashFiles.js';

beforeEach(() => { parsing.beforePublish = undefined; appData = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-maintenance-')); initializeDatabase(); });
afterEach(() => { closeDatabaseConnection(); fs.rmSync(appData, { recursive: true, force: true }); });

function file(text: string) {
  const { assetsDir } = resolveRuntimeDataPaths();
  fs.mkdirSync(assetsDir, { recursive: true });
  const key = `${createHash('sha256').update(text).digest('hex')}.png`;
  fs.writeFileSync(path.join(assetsDir, key), text);
  return key;
}

function node(id: string, content: string) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId: null, kind: 'topic', title: id, isTitleManual: true,
    content, reveal: null, anchorLink: null, position: null, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z' });
}

it('observes recoverable trash bodies and preserves local settings across reopened connections', async () => {
  const retained = file('retained');
  const orphan = file('orphan');
  node('recoverable', `![image](asset://${retained})`);
  softDeleteNodes({ nodeIds: ['recoverable'], deletedAt: '2026-09-20T01:00:00Z' });
  await runDesktopAttachmentMaintenance({ action: 'configure', settings: { automatic: false, observationThreshold: 1 } });
  const observed = await runDesktopAttachmentMaintenance({ action: 'observe' });
  expect(observed.eligibleBytes).toBe(6);
  closeDatabaseConnection();
  initializeDatabase();
  expect(await runDesktopAttachmentMaintenance({ action: 'status' })).toMatchObject({ observationThreshold: 1, eligibleBytes: 6 });
  const cleaned = await runDesktopAttachmentMaintenance({ action: 'clean' });
  expect(cleaned.trash.map((entry) => entry.storageKey)).toEqual([orphan]);
  expect(fs.existsSync(path.join(resolveRuntimeDataPaths().assetsDir, retained))).toBe(true);
});

it('invalidates old orphan conclusions when the database file is replaced', async () => {
  const key = file('orphan');
  await runDesktopAttachmentMaintenance({ action: 'configure', settings: { automatic: false, observationThreshold: 1 } });
  await runDesktopAttachmentMaintenance({ action: 'observe' });
  const databasePath = openDatabaseConnection().dbPath;
  closeDatabaseConnection();
  fs.copyFileSync(databasePath, `${databasePath}.restored`);
  fs.renameSync(`${databasePath}.restored`, databasePath);
  initializeDatabase();
  const result = await runDesktopAttachmentMaintenance({ action: 'clean' });
  expect(result).toMatchObject({ eligibleBytes: 0, trashBytes: 0 });
  expect(fs.existsSync(path.join(resolveRuntimeDataPaths().assetsDir, key))).toBe(true);
});

it('observes owned body references after retired shared caches are removed', async () => {
  file('orphan');
  node('unreadable', 'Original body');
  openDatabaseConnection().sqlite.prepare('DELETE FROM content_blob_data').run();
  const observed = await runDesktopAttachmentMaintenance({ action: 'observe' });
  expect(observed.lastObservationDay).not.toBeNull();
  expect(openDatabaseConnection().sqlite.prepare("SELECT content FROM nodes WHERE id = 'unreadable'").pluck().get())
    .toBe('Original body');
  expect(await runDesktopAttachmentMaintenance({ action: 'status' })).toMatchObject({ lastObservationDay: observed.lastObservationDay });
});

it('keeps recoverable files available through trash and removes availability only after physical retirement', async () => {
  const key = file('orphan with original bytes');
  const hash = key.slice(0, 64);
  await runDesktopAttachmentMaintenance({ action: 'configure', settings: { automatic: false, observationThreshold: 1 } });
  await runDesktopAttachmentMaintenance({ action: 'observe' });
  await runDesktopAttachmentMaintenance({ action: 'clean' });
  const available = () => openDatabaseConnection().sqlite.prepare(
    'SELECT available FROM framed_sync_resource_availability WHERE hash = ?').pluck().get(hash);
  expect(available()).toBe(1);
  await runDesktopAttachmentMaintenance({ action: 'restore', storageKeys: [key] });
  expect(available()).toBe(1);
  moveAttachmentToTrash(resolveRuntimeDataPaths().assetsDir, key);
  await runDesktopAttachmentMaintenance({ action: 'empty-trash' });
  expect(available()).toBe(0);
  expect(fs.existsSync(path.join(resolveRuntimeDataPaths().assetsDir, key))).toBe(false);
});

it('ignores retired transfer artifacts while retaining owned bodies and active attachment send leases', async () => {
  const owned = file('owned');
  const orphan = file('orphan');
  node('topic', `![image](asset://${owned})`);
  const { assetsDir } = resolveRuntimeDataPaths();
  const obsolete = path.join(path.dirname(openDatabaseConnection().dbPath), '..', 'SyncRequests', 'inbound', 'obsolete');
  fs.mkdirSync(obsolete, { recursive: true });
  fs.writeFileSync(path.join(obsolete, 'record.json'), 'retired transport metadata');
  const originals = openDatabaseConnection().sqlite.prepare('SELECT * FROM node_sync_versions').all();
  await runDesktopAttachmentMaintenance({ action: 'configure', settings: { automatic: false, observationThreshold: 1 } });
  expect(await runDesktopAttachmentMaintenance({ action: 'observe' })).toMatchObject({ eligibleBytes: 6 });
  await withAttachmentFileLease(path.join(assetsDir, orphan), async () => {
    await expect(runDesktopAttachmentMaintenance({ action: 'clean' })).rejects.toThrow('attachment_send_busy');
    expect(fs.readFileSync(path.join(assetsDir, orphan), 'utf8')).toBe('orphan');
  });
  expect((await runDesktopAttachmentMaintenance({ action: 'clean' })).trash.map(entry => entry.storageKey)).toEqual([orphan]);
  expect(fs.readFileSync(path.join(assetsDir, owned), 'utf8')).toBe('owned');
  expect(openDatabaseConnection().sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(originals);
});


it('reuses unchanged observation inputs without parsing their bodies again on the main thread', async () => {
  const key = file('image used by unchanged article');
  node('unchanged', `![image](asset://${key})`);
  await runDesktopAttachmentMaintenance({ action: 'observe' });
  parsing.calls = 0;
  const result = await runDesktopAttachmentMaintenance({ action: 'observe' });
  expect(result).toMatchObject({ eligibleBytes: 0, trashBytes: 0 });
  expect(parsing.calls, 'unchanged observations must not reparse article bodies on the main thread').toBe(0);
});

it('retains the last complete day when foreground edits overtake a worker batch and repairs only pending inputs', async () => {
  const key = file('edited while scanning');
  node('edited', `![image](asset://${key})`);
  parsing.beforePublish = () => {
    parsing.beforePublish = undefined;
    openDatabaseConnection().sqlite.prepare("UPDATE nodes SET content='',body_blob_hash=NULL WHERE id='edited'").run();
  };
  expect(await runDesktopAttachmentMaintenance({ action: 'observe' })).toMatchObject({ observationComplete: false, lastObservationDay: null });
  expect(openDatabaseConnection().sqlite.prepare("SELECT count(*) FROM attachment_reference_cache WHERE node_id='edited'").pluck().get()).toBe(0);
  expect(await runDesktopAttachmentMaintenance({ action: 'observe' })).toMatchObject({ observationComplete: true });
});

it('rejects a late batch when its library has been replaced', async () => {
  node('old-library', 'Old library content');
  parsing.beforePublish = () => {
    parsing.beforePublish = undefined;
    const databasePath = openDatabaseConnection().dbPath;
    closeDatabaseConnection();
    fs.copyFileSync(databasePath, `${databasePath}.restored`);
    fs.renameSync(`${databasePath}.restored`, databasePath);
    initializeDatabase();
  };
  await expect(runDesktopAttachmentMaintenance({ action: 'observe' })).rejects.toThrow('attachment_scan_database_replaced');
  expect(openDatabaseConnection().sqlite.prepare('SELECT count(*) FROM attachment_reference_cache').pluck().get()).toBe(0);
  expect(await runDesktopAttachmentMaintenance({ action: 'status' })).toMatchObject({ lastObservationDay: null });
});
