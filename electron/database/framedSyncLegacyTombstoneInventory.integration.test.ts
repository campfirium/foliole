// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { framedSyncResourceVersionSql } from '../../lib/core/database/framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from '../../lib/core/database/framedSyncInventorySchema.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory, readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { publishDesktopFramedSyncNodeOutbound } from './desktopFramedSyncOutboundSelection.js';
import { closeLibraries, createPeer, edit, startLibraries, type Peer } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function legacyTombstone() {
  const peer = createPeer('legacy-permanent-delete');
  edit(peer, 'Preserved historical body');
  peer.db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: peer.db, driver: peer.driver });
  deleteNodesPermanently(peer.driver, {
    nodeIds: ['topic'], nodeOrder: [], deletedAt: '2026-07-24T02:12:44.137Z'
  });
  // Reproduce the observed historical state, rather than a modern delete writer.
  peer.db.prepare("UPDATE sync_object_state SET current_version_id = NULL WHERE object_type = 'node' AND object_id = 'topic'").run();
  return peer;
}

function protectedFacts(peer: Peer) {
  return ['node_sync_tombstones', 'node_sync_versions', 'sync_object_state', 'content_blob_data',
    'framed_sync_outbound_holds'].map((table) => peer.db.prepare(`SELECT * FROM ${table}`).all());
}

async function resources(peer: Peer) {
  const inventory = await readFramedSyncInventory(peer.port);
  return inventory.find((item) => item.objectType === 'node' && item.globalId === 'topic')?.resourceHashes
    .map((hash) => Buffer.from(hash).toString('hex'));
}

it('discovers the canonical empty body of a proven legacy permanent tombstone without a current version pointer', async () => {
  const peer = legacyTombstone();
  const before = protectedFacts(peer);
  expect(await resources(peer)).toEqual([EMPTY_BODY_HASH]);
  expect(protectedFacts(peer)).toEqual(before);
  expect(peer.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
});

it.each(['desktop', 'companion'])('repairs the %s derived inventory through a numbered migration and maintains it on later writes', async (host) => {
  const peer = legacyTombstone();
  for (const sql of FRAMED_SYNC_INVENTORY_TRIGGERS) {
    const name = /^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)![1];
    peer.db.exec(`DROP TRIGGER ${name}`);
    peer.db.exec(sql.replaceAll(framedSyncResourceVersionSql('state'), 'state.current_version_id'));
  }
  peer.db.prepare("UPDATE framed_sync_inventory SET resources_json = '[]' WHERE object_id = 'topic'").run();
  const before = protectedFacts(peer);
  expect(await resources(peer)).toEqual([]);
  if (host === 'desktop') {
    peer.db.pragma('user_version = 143');
    initializeDatabaseSchema(peer.db);
  } else await peer.port.transaction((tx) => migrateCompanionDatabase(tx, 72, 73));
  expect(await resources(peer)).toEqual([EMPTY_BODY_HASH]);
  expect(protectedFacts(peer)).toEqual(before);
  peer.db.prepare("UPDATE sync_object_state SET updated_at = updated_at WHERE object_id = 'topic'").run();
  expect(await resources(peer)).toEqual([EMPTY_BODY_HASH]);
  const reopened = new Database(peer.file, { readonly: true });
  try {
    const entries = await readFramedSyncInventory(createBetterSqliteDbPort(reopened));
    expect(entries.find((item) => item.objectType === 'node' && item.globalId === 'topic')?.resourceHashes
      .map((hash) => Buffer.from(hash).toString('hex'))).toEqual([EMPTY_BODY_HASH]);
  } finally { reopened.close(); }
});

it.each(['hash', 'deletion time'])('does not advertise tombstone resources when the %s does not match the deleted state', async (field) => {
  const peer = legacyTombstone();
  const column = field === 'hash' ? 'content_hash' : 'deleted_at';
  peer.db.prepare(`UPDATE node_sync_tombstones SET ${column} = 'mismatch' WHERE node_id = 'topic'`).run();
  expect(await resources(peer)).toEqual([]);
});

it('publishes the proven legacy deletion with its canonical empty body instead of deferring it', async () => {
  const peer = legacyTombstone();
  const local = (await readFramedSyncInventory(peer.port)).filter((item) => item.objectType === 'node');
  const [difference] = compareFramedSyncInventories({ local, remote: [] });
  if (!difference) throw new Error('expected deletion difference');
  const result = await publishDesktopFramedSyncNodeOutbound({ port: peer.port, difference,
    readCurrentInventoryEntry: readFramedSyncInventoryEntry,
    context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      senderDeviceId: 'source', senderLibraryEpoch: 'source-epoch',
      receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' } });
  expect(result.kind).toBe('published');
  if (result.kind !== 'published') throw new Error('expected publication');
  expect(result.publication.manifest.blobs).toContainEqual(expect.objectContaining({
    byteLength: 0n, sha256: Uint8Array.from(Buffer.from(EMPTY_BODY_HASH, 'hex'))
  }));
});
