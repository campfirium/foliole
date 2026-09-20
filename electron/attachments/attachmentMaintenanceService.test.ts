// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: appData,
  app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs') }) }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { runDesktopAttachmentMaintenance } from './attachmentMaintenanceService.js';

beforeEach(() => { appData = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-maintenance-')); initializeDatabase(); });
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

it('does not count when a retained content blob is unreadable', async () => {
  file('orphan');
  node('unreadable', 'Original body');
  openDatabaseConnection().sqlite.prepare('DELETE FROM content_blob_data').run();
  await expect(runDesktopAttachmentMaintenance({ action: 'observe' })).rejects.toThrow('body_unreadable');
  expect(await runDesktopAttachmentMaintenance({ action: 'status' })).toMatchObject({ lastObservationDay: null, eligibleBytes: 0 });
});
