// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-special-root-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { initializeDatabaseConnection } from '../../lib/core/database/migrations.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';
import { readPackRowsFromZip, readStoredZipEntries } from './syncPackZipReaderTestSupport.js';

const roots: string[] = [];

afterEach(() => {
  closeDatabaseConnection();
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

it('reconstructs a missing special parent before applying an incremental child version', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-sync-pack-special-root-'));
  roots.push(root);
  mockedAppDataDir = path.join(root, 'source');
  initializeDatabaseConnection(openDatabaseConnection());
  insertInboxChild();
  const packPath = path.join(root, 'incremental.syncpack');
  await buildDesktopSyncPack({
    fromDeviceId: 'desktop-a', fromStateSeq: 0, outputPath: packPath,
    packId: 'special-root-pack', toPeerId: 'android-b'
  });
  expect(readPackRowsFromZip(packPath, root).nodes).toEqual([
    expect.objectContaining({ id: 'child-1' })
  ]);
  closeDatabaseConnection();

  const target = new Database(path.join(root, 'android.db'));
  target.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  target.pragma('foreign_keys = ON');
  const incomingPath = path.join(root, 'incoming.db');
  const entries = readStoredZipEntries(packPath);
  fs.writeFileSync(incomingPath, inflateSync(entries.get('incoming.db.deflate')!));
  const port = createBetterSqliteDbPort(target, { name: 'special-root-target' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0, hostName: 'android-b', sourcePeerId: 'desktop-a'
    })).resolves.toMatchObject({ applied: true, appliedObjectCount: 1 });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(target.prepare('SELECT id, title FROM nodes ORDER BY id').all()).toEqual([
    { id: 'child-1', title: 'Child' },
    { id: 'special-inbox', title: 'Inbox' }
  ]);
  expect(target.prepare('SELECT object_id FROM node_sync_versions').all()).toEqual([
    { object_id: 'child-1' }
  ]);
  target.close();
});

function insertInboxChild() {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (
    id, parent_id, kind, title, is_title_manual, created_at, updated_at
  ) VALUES ('special-inbox', NULL, 'folder', 'Inbox', 1, ?, ?)`, [
    '2026-08-11T01:59:00.000Z', '2026-08-11T01:59:00.000Z'
  ]);
  driver.execute(`INSERT INTO nodes (
    id, parent_id, kind, title, current_version_id, created_at, updated_at
  ) VALUES ('child-1', 'special-inbox', 'topic', 'Child', 'desktop-a#1', ?, ?)`, [
    '2026-08-11T02:00:00.000Z', '2026-08-11T02:00:00.000Z'
  ]);
  driver.execute(`INSERT INTO node_sync_versions (
    version_id, object_id, host_name, created_at, content_hash, snapshot_json
  ) VALUES ('desktop-a#1', 'child-1', 'desktop-a', ?, 'child-hash', ?)`, [
    '2026-08-11T02:00:00.000Z', '{"id":"child-1","parent_id":"special-inbox","title":"Child"}'
  ]);
  driver.execute(`INSERT INTO sync_object_state (
    object_type, object_id, state_seq, current_version_id, content_hash,
    last_modified_by_host_name, updated_at, sync_dirty
  ) VALUES ('node', 'child-1', 1, 'desktop-a#1', 'child-hash', 'desktop-a', ?, 1)`, [
    '2026-08-11T02:00:00.000Z'
  ]);
}
