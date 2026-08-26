import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { prepareCompanionCopiedLibraryForDevice } from
  '../../src/shared/platform/companion/sync/syncDeviceCopyPreparation.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { prepareDesktopCopiedLibraryForDevice } from './syncDeviceCopyPreparation.js';

const databases: Database.Database[] = [];
const ORIGINAL_PATH = '/fixtures/library-a/Data/foliole.db';
const COPIED_PATH = '/fixtures/library-copy/Data/foliole.db';

afterEach(() => {
  for (const sqlite of databases.splice(0)) sqlite.close();
});

describe('inactive T152 Device copy preparation', () => {
  it.each(['electron', 'android', 'ios'] as const)(
    'preserves the business content digest while clearing only local transport progress for %s',
    expectAdapterCopyPreparation
  );

  it('does nothing while the Device identity is unchanged', async () => {
    const sqlite = fixtureDatabase();
    const before = databaseSnapshot(sqlite);
    const currentIdentity = identity(ORIGINAL_PATH);
    await expect(prepareDesktopCopiedLibraryForDevice(sqlite, {
      currentIdentity,
      previousIdentity: currentIdentity
    })).resolves.toEqual({ changed: false, clearedMetaKeys: 0, clearedTables: [] });
    expect(databaseSnapshot(sqlite)).toEqual(before);
  });

  it('rolls back every cleared cursor and ack when one table rejects the transaction', async () => {
    const sqlite = fixtureDatabase();
    const before = databaseSnapshot(sqlite);
    sqlite.exec(`CREATE TRIGGER reject_delivery_clear BEFORE DELETE ON sync_delivery_receipts
      BEGIN SELECT RAISE(ABORT, 'fixture_failure'); END`);

    await expect(prepareDesktopCopiedLibraryForDevice(sqlite, {
      currentIdentity: identity(COPIED_PATH),
      previousIdentity: identity(ORIGINAL_PATH)
    })).rejects.toThrow('fixture_failure');
    expect(databaseSnapshot(sqlite)).toEqual(before);
  });

  it('refuses to treat a different Sync Group as a copied Device', async () => {
    const sqlite = fixtureDatabase();
    const currentIdentity = createSyncGroupDeviceIdentity({
      device_anchor: 'a1111111-1111-4111-8111-111111111111',
      group_id: 'group-b',
      library_path: COPIED_PATH,
      path_flavor: 'posix'
    });
    await expect(prepareDesktopCopiedLibraryForDevice(sqlite, {
      currentIdentity,
      previousIdentity: identity(ORIGINAL_PATH)
    })).rejects.toThrow('copied_library_group_mismatch');
  });
});

async function expectAdapterCopyPreparation(host: 'electron' | 'android' | 'ios') {
  const sqlite = fixtureDatabase();
  const before = businessDigest(sqlite);
  const input = { currentIdentity: identity(COPIED_PATH), previousIdentity: identity(ORIGINAL_PATH) };
  const result = host === 'electron'
    ? await prepareDesktopCopiedLibraryForDevice(sqlite, input)
    : await prepareCompanionCopiedLibraryForDevice(
      host,
      createBetterSqliteDbPort(sqlite, { name: `${host}-device-copy-preparation` }),
      input
    );
  expect(result).toEqual({
    changed: true,
    clearedMetaKeys: 2,
    clearedTables: [
      'sync_peer_cursors', 'sync_delivery_receipts', 'sync_group_nonce_ledger',
      'sync_push_ack', 'sync_peers'
    ]
  });
  expect(transportCounts(sqlite)).toEqual({
    companionMeta: 1, delivery: 0, nonce: 0, peerCursors: 0, peers: 0, pushAck: 0
  });
  expect(businessDigest(sqlite)).toBe(before);
}

function identity(libraryPath: string) {
  return createSyncGroupDeviceIdentity({
    device_anchor: 'a1111111-1111-4111-8111-111111111111',
    group_id: 'group-a',
    library_path: libraryPath,
    path_flavor: 'posix'
  });
}

function fixtureDatabase() {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, content TEXT, current_version_id TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT, snapshot_json TEXT);
    CREATE TABLE attachments (id TEXT PRIMARY KEY, storage_key TEXT);
    CREATE TABLE review_log (op_id TEXT PRIMARY KEY, node_id TEXT, grade INTEGER);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE sync_peer_cursors (authorization_id TEXT, stream_name TEXT, cursor_value TEXT);
    CREATE TABLE sync_delivery_receipts (authorization_id TEXT, operation_id TEXT);
    CREATE TABLE sync_group_nonce_ledger (group_id TEXT, identity TEXT);
    CREATE TABLE sync_push_ack (client_op_id TEXT);
    CREATE TABLE sync_peers (peer_id TEXT, last_seen_version_cursor TEXT);
    CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO nodes VALUES ('topic-a', 'Body A', 'version-a');
    INSERT INTO node_sync_versions VALUES ('version-a', 'topic-a', '{"content":"Body A"}');
    INSERT INTO attachments VALUES ('attachment-a', 'sha256-a');
    INSERT INTO review_log VALUES ('review-a', 'topic-a', 3);
    INSERT INTO settings VALUES ('theme', 'dark');
    INSERT INTO sync_peer_cursors VALUES ('peer-a', 'state', '9');
    INSERT INTO sync_delivery_receipts VALUES ('peer-a', 'operation-a');
    INSERT INTO sync_group_nonce_ledger VALUES ('group-a', 'nonce-a');
    INSERT INTO sync_push_ack VALUES ('ack-a');
    INSERT INTO sync_peers VALUES ('peer-a', 'version-a');
    INSERT INTO companion_meta VALUES ('sync_pack_cursor', '9');
    INSERT INTO companion_meta VALUES ('sync_state_push_cursor', '8');
    INSERT INTO companion_meta VALUES ('workspace_snapshot', 'preserved');
  `);
  return sqlite;
}

function businessSnapshot(sqlite: Database.Database) {
  return {
    attachments: sqlite.prepare('SELECT * FROM attachments ORDER BY id').all(),
    nodes: sqlite.prepare('SELECT * FROM nodes ORDER BY id').all(),
    reviews: sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all(),
    settings: sqlite.prepare('SELECT * FROM settings ORDER BY key').all(),
    versions: sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()
  };
}

function businessDigest(sqlite: Database.Database) {
  return createHash('sha256').update(JSON.stringify(businessSnapshot(sqlite))).digest('hex');
}

function transportCounts(sqlite: Database.Database) {
  const count = (table: string) => (sqlite.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get() as { value: number }).value;
  return {
    companionMeta: count('companion_meta'), delivery: count('sync_delivery_receipts'),
    nonce: count('sync_group_nonce_ledger'), peerCursors: count('sync_peer_cursors'),
    peers: count('sync_peers'), pushAck: count('sync_push_ack')
  };
}

function databaseSnapshot(sqlite: Database.Database) {
  return { business: businessSnapshot(sqlite), transport: transportCounts(sqlite) };
}
