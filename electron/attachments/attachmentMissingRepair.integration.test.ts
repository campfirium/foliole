// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: appData,
  app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs') }) }));

import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { runDesktopAttachmentMaintenance } from './attachmentMaintenanceService.js';

beforeEach(() => { appData = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-missing-repair-')); initializeDatabase(); });
afterEach(() => { closeDatabaseConnection(); fs.rmSync(appData, { recursive: true, force: true }); });

const assets = () => resolveRuntimeDataPaths().assetsDir;

function file(text: string) {
  fs.mkdirSync(assets(), { recursive: true });
  const key = `${createHash('sha256').update(text).digest('hex')}.png`;
  fs.writeFileSync(path.join(assets(), key), text);
  return key;
}

function article(id: string, key: string) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId: null, kind: 'topic', title: id, isTitleManual: true,
    content: `![image](asset://${key})`, reveal: null, anchorLink: null, position: null,
    createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z' });
}

async function syncNeeds() {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const host = { readSnapshot: <T>(read: (db: typeof port) => Promise<T>) => port.transaction(read),
    write: <T>(write: (db: typeof port) => Promise<T>) => write(port) };
  const inspect = async (keys: string[]) => keys.map(key => fs.existsSync(path.join(assets(), key)));
  return (await readRequestSyncAttachmentNeedsSlice(host, inspect, () => false)).keys;
}

function availability(key: string) {
  return openDatabaseConnection().sqlite.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?')
    .pluck().get(key.slice(0, 64));
}

it('demands a referenced file again after it disappears outside the app', async () => {
  const key = file('referenced');
  article('live', key);
  expect(await syncNeeds()).toEqual([]);
  fs.rmSync(path.join(assets(), key));
  expect(await syncNeeds()).toEqual([]);
  await runDesktopAttachmentMaintenance({ action: 'observe' });
  expect(availability(key)).toBe(0);
  expect(await syncNeeds()).toEqual([key]);
});

it('does not demand unreferenced, soft-deleted-only, or unmounted-folder files', async () => {
  const orphan = file('orphan');
  const recoverable = file('recoverable');
  const live = file('live');
  article('trashed', recoverable);
  article('live', live);
  softDeleteNodes({ nodeIds: ['trashed'], deletedAt: '2026-10-23T01:00:00Z' });
  expect(await syncNeeds()).toEqual([]);
  fs.rmSync(path.join(assets(), orphan));
  fs.rmSync(path.join(assets(), recoverable));
  await runDesktopAttachmentMaintenance({ action: 'observe' });
  expect(await syncNeeds()).toEqual([]);
  fs.rmSync(assets(), { recursive: true });
  await runDesktopAttachmentMaintenance({ action: 'observe' });
  expect(await syncNeeds()).toEqual([]);
});
