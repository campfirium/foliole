// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import {
  loadPendingNodeVersionReceipts,
  markNodeVersionReceiptDelivered,
  prepareInboundNodeVersionReceipt,
  recordInboundNodeVersionReceipt
} from '../../lib/core/sync/nodeVersionInboundReceipt.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('persists an exact per-node base from the receiver state before pack apply', async () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    sqlite.exec(`
      INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
        VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'group', 'receiver', 'active', 'now');
      INSERT INTO sync_group_devices
        (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
         platform, state, joined_at, updated_at)
        VALUES ('group', 'receiver', 'receiver-anchor', '/receiver', 'Receiver', 'mac', 'active', 'now', 'now'),
          ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now'),
          ('group', 'other', 'other-anchor', '/other', 'Other', 'mac', 'active', 'now', 'now');
      INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
        VALUES ('node', 'topic', 'Node', 'A', 'now', 'now');
      INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
        VALUES ('A', 'node', NULL, 'source', 'before', 'hash-a', 'body-a', '{"content":"body-a"}');
      ATTACH DATABASE ':memory:' AS inc;
      CREATE TABLE inc.pack_manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO inc.pack_manifest VALUES ('manifest_json', '{"pack_id":"pack-1"}');
      CREATE TABLE inc.nodes (id TEXT PRIMARY KEY, current_version_id TEXT);
      INSERT INTO inc.nodes VALUES ('node', 'E');
    `);
    const port = createBetterSqliteDbPort(sqlite);
    const prepared = await prepareInboundNodeVersionReceipt(port, 'inc');
    sqlite.exec(`
      INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
        VALUES ('E', 'node', 'A', 'source', 'later', 'hash-e', 'body-e', '{"content":"body-e"}');
      INSERT INTO node_sync_version_parents VALUES ('E', 'A', 0);
      UPDATE nodes SET current_version_id = 'E' WHERE id = 'node';
    `);

    const results = await port.transaction((tx) => recordInboundNodeVersionReceipt(tx, prepared, 'source'));
    expect(results).toEqual([{ baseVersionId: 'A', objectId: 'node', result: 'applied', sentVersionId: 'E' }]);
    const [receipt] = await loadPendingNodeVersionReceipts(port, 'source');
    expect(receipt).toMatchObject({ packId: 'pack-1', proofRevision: 1, results });
    expect((await recordInboundNodeVersionReceipt(port, prepared, 'source'))).toEqual(results);
    await expect(recordInboundNodeVersionReceipt(port, prepared, 'other'))
      .rejects.toThrow('node_version_receipt_identity_mismatch');
    expect(sqlite.prepare('SELECT proof_revision FROM node_version_local_proof_state').get())
      .toEqual({ proof_revision: 1 });
    sqlite.exec(`INSERT INTO node_sync_tombstones
      (node_id, version_id, parent_version_id, host_name, content_hash,
       snapshot_json, deleted_at, created_at)
      VALUES ('node', 'deleted', 'E', 'source', 'hash-deleted', '{}', 'later', 'later')`);
    expect(await recordInboundNodeVersionReceipt(port, { ...prepared, packId: 'pack-2' }, 'source'))
      .toEqual([{ baseVersionId: null, objectId: 'node', result: 'blocked', sentVersionId: 'E' }]);
    await recordInboundNodeVersionReceipt(port, { ...prepared, packId: 'pack-3' }, 'other');
    expectSourceRevisions(sqlite);
    await markNodeVersionReceiptDelivered(port, 'pack-1');
    expect((await loadPendingNodeVersionReceipts(port, 'source')).map((item) => item.packId))
      .toEqual(['pack-2']);
  } finally {
    sqlite.close();
  }
});

function expectSourceRevisions(sqlite: Database.Database) {
  expect(sqlite.prepare(`SELECT source_device_identity_key, proof_revision
    FROM node_version_local_source_revisions ORDER BY source_device_identity_key`).all())
    .toEqual([{ source_device_identity_key: 'other', proof_revision: 1 },
      { source_device_identity_key: 'source', proof_revision: 2 }]);
}
