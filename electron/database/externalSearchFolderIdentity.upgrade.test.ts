// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { reconnectExternalSearchFolder } from './externalSearchFolderConnection.js';
import { loadExternalSearchFolders, loadRefreshableExternalSearchFolders } from './externalSearchFolders.js';
import { migrateDesktopHostProfile } from './hostProfile.js';
import { textDevice } from './topicTextState.testSupport.js';

const database = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: database.open }));
vi.mock('../managedPathSafety.js', () => ({ loadManagedPathCandidates: () => [] }));

const oldTime = '2026-10-01T00:00:00.000Z';
const upgradeTime = '2026-11-24T00:00:00.000Z';
const host = 'Desktop';
const localId = '805d79bf-5603-4e33-9160-294c4cb3281f';

it('restores local refresh for a legacy connected folder while leaving mirrors alone', () => {
  const { sqlite } = textDevice();
  try {
    const driver = createBetterSqlite3Driver(sqlite);
    const connection = { driver, sqlite } as Parameters<typeof migrateDesktopHostProfile>[0];
    database.open.mockReturnValue(connection);
    driver.execute("INSERT INTO settings VALUES ('host_name', ?, ?), ('standalone_device_uuid', ?, ?)",
      [JSON.stringify(host), oldTime, JSON.stringify(localId), oldTime]);
    seedLegacyFolder(driver, 'local', path.resolve('Local documents'), 'connected');
    seedLegacyFolder(driver, 'mirror', '', 'needs-folder');
    expect(loadRefreshableExternalSearchFolders()).toEqual([]);

    migrateDesktopHostProfile(connection, host, upgradeTime);

    expect(loadExternalSearchFolders().map(folder => [folder.id, folder.access_mode]).sort())
      .toEqual([['local', 'local'], ['mirror', 'remote_mirror']]);
    expect(loadRefreshableExternalSearchFolders().map(folder => folder.id)).toEqual(['local']);
    const localHash = canonicalFolderHash(driver, 'local');
    expect(driver.queryOne(`SELECT content_hash, sync_dirty FROM sync_object_state
      WHERE object_type = 'external_folder' AND object_id = 'local'`))
      .toEqual({ content_hash: localHash, sync_dirty: 1 });
    expect(driver.queryOne(`SELECT sync_dirty, updated_at FROM sync_object_state
      WHERE object_type = 'external_folder' AND object_id = 'mirror'`))
      .toEqual({ sync_dirty: 0, updated_at: oldTime });
    migrateDesktopHostProfile(connection, host, '2026-11-25T00:00:00.000Z');
    expect(driver.queryOne(`SELECT updated_at FROM sync_object_state
      WHERE object_type = 'external_folder' AND object_id = 'local'`)).toEqual({ updated_at: upgradeTime });
  } finally {
    sqlite.close();
  }
});

it('resumes refresh for a legacy folder recorded under the active sync member name', () => {
  const { sqlite } = textDevice();
  try {
    const driver = createBetterSqlite3Driver(sqlite);
    const connection = { driver, sqlite } as Parameters<typeof migrateDesktopHostProfile>[0];
    database.open.mockReturnValue(connection);
    const memberName = 'Sync device name';
    driver.execute("INSERT INTO settings VALUES ('host_name', ?, ?)", [JSON.stringify(host), oldTime]);
    driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', ?, ?)", [oldTime, oldTime]);
    driver.execute(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
      canonical_library_path, device_name, platform, state, joined_at, updated_at)
      VALUES ('group', 'local-member', 'anchor', '/local', ?, ?, 'active', ?, ?)`,
    [memberName, process.platform, oldTime, oldTime]);
    driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', 'local-member', 'active', ?)", [oldTime]);
    seedLegacyFolder(driver, 'member-local', path.resolve('Member documents'), 'connected', memberName);
    seedLegacyFolder(driver, 'member-mirror', '', 'needs-folder', memberName);

    migrateDesktopHostProfile(connection, host, upgradeTime);

    expect(loadRefreshableExternalSearchFolders().map(folder => folder.id)).toEqual(['member-local']);
    expect(loadExternalSearchFolders().map(folder => [folder.id, folder.access_mode]).sort())
      .toEqual([['member-local', 'local'], ['member-mirror', 'remote_mirror']]);
  } finally {
    sqlite.close();
  }
});

it('retains the local status of a disconnected folder and allows reconnecting after upgrade', async () => {
  const { sqlite } = textDevice();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-reconnect-'));
  try {
    const driver = createBetterSqlite3Driver(sqlite);
    const connection = { driver, sqlite } as Parameters<typeof migrateDesktopHostProfile>[0];
    database.open.mockReturnValue(connection);
    driver.execute("INSERT INTO settings VALUES ('host_name', ?, ?), ('standalone_device_uuid', ?, ?)",
      [JSON.stringify(host), oldTime, JSON.stringify(localId), oldTime]);
    seedLegacyFolder(driver, 'disconnected', path.join(root, 'old-location'), 'needs-folder');
    await fs.writeFile(path.join(root, 'new-document.md'), '# Reconnected');

    migrateDesktopHostProfile(connection, host, upgradeTime);

    expect(loadRefreshableExternalSearchFolders()).toEqual([]);
    await expect(reconnectExternalSearchFolder('disconnected', root)).resolves.toMatchObject([
      { id: 'disconnected', access_mode: 'local', folder_path: root, source_executable: true }
    ]);
    expect(loadRefreshableExternalSearchFolders().map(folder => folder.id)).toEqual(['disconnected']);
  } finally {
    sqlite.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('recognizes a local folder upgraded from a schema without a connection status', () => {
  const { sqlite } = textDevice();
  try {
    const driver = createBetterSqlite3Driver(sqlite);
    const connection = { driver, sqlite } as Parameters<typeof migrateDesktopHostProfile>[0];
    database.open.mockReturnValue(connection);
    driver.execute("INSERT INTO settings VALUES ('host_name', ?, ?), ('standalone_device_uuid', ?, ?)",
      [JSON.stringify(host), oldTime, JSON.stringify(localId), oldTime]);
    seedLegacyFolder(driver, 'older-local', path.resolve('Local documents'), undefined);

    migrateDesktopHostProfile(connection, host, upgradeTime);

    expect(loadRefreshableExternalSearchFolders().map(folder => folder.id)).toEqual(['older-local']);
  } finally {
    sqlite.close();
  }
});

type Driver = ReturnType<typeof createBetterSqlite3Driver>;

function seedLegacyFolder(driver: Driver, id: string, root: string, status: string | undefined, sourceHost = host) {
  const ref = `external:${id}`;
  driver.execute(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name, host_platform,
    root_path, path_flavor, type_settings_json, created_at, updated_at) VALUES (?, 'external', ?, ?, ?, ?, ?, ?, ?, ?)`,
  [ref, id, sourceHost, process.platform, root, process.platform === 'win32' ? 'windows' : 'posix',
    JSON.stringify({ connectionStatus: status }), oldTime, oldTime]);
  driver.execute(`INSERT INTO external_search_folders
    (id, folder_path, attachment_mode, created_at, updated_at, source_ref)
    VALUES (?, ?, 'document_relative', ?, ?, ?)`, [id, root || '/Remote documents', oldTime, oldTime, ref]);
  upsertSyncObjectState(driver, { objectType: 'external_folder', objectId: id,
    contentHash: canonicalFolderHash(driver, id), lastModifiedByHostName: sourceHost, updatedAt: oldTime });
}

function canonicalFolderHash(driver: Driver, id: string) {
  const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder, [id]);
  return computeSyncContentHash('external_folder', JSON.parse(row!.payload_json));
}
