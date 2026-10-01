import Database from 'better-sqlite3';

import { createFakeCapacitorConnection, installCompanionNodeSchema } from '../../../companionSyncNodeVersionsTestSupport';

export const SNAPSHOT_NODE_COUNT = 1203;
export const snapshotNodeId = (index: number) => `node-${index}`;
const stamp = '2026-09-20T00:00:00.000Z';

export function seedSnapshotDatabase(database: Database.Database) {
  installCompanionNodeSchema(database);
  database.prepare('INSERT INTO companion_meta VALUES (?, ?, ?)').run('host_name', 'Phone', stamp);
  const node = database.prepare(`INSERT INTO nodes
    (id, parent_id, title, content, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  database.transaction(() => {
    for (let index = 0; index < SNAPSHOT_NODE_COUNT; index++) {
      const parent = index === 0 ? null : snapshotNodeId(index === 1202 ? 1201 : 0);
      node.run(snapshotNodeId(index), parent, `Title ${index}`, index === 17 ? '' : `Body ${index}`,
        stamp, stamp, index === 1201 ? stamp : null);
    }
    const insertOrder = database.prepare(
      'INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)'
    );
    insertOrder.run('parent-child-order:root', JSON.stringify([snapshotNodeId(0)]), stamp);
    insertOrder.run(snapshotNodeId(0), JSON.stringify(
      Array.from({ length: SNAPSHOT_NODE_COUNT - 2 }, (_, index) => snapshotNodeId(1201 - index))
    ), stamp);
    insertOrder.run(snapshotNodeId(1201), JSON.stringify([snapshotNodeId(1202)]), stamp);
  })();
  const hash = 'a'.repeat(64);
  database.prepare(`INSERT INTO content_blobs
    (hash, storage_key, kind, original_size_bytes, stored_size_bytes, original_sha256,
    stored_sha256, availability, created_at) VALUES (?, ?, 'text', 9, 9, ?, ?, 'ready', ?)`)
    .run(hash, hash, hash, hash, stamp);
  database.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(hash, Buffer.from('Blob 正文'));
  database.prepare('UPDATE nodes SET body_blob_hash = ?, content = ? WHERE id = ?')
    .run(hash, 'stale inline', snapshotNodeId(19));
  database.prepare('UPDATE nodes SET body_blob_hash = ?, content = ? WHERE id = ?')
    .run('b'.repeat(64), '', snapshotNodeId(18));
  database.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?')
    .run(JSON.stringify([{ storage_key: `${'c'.repeat(64)}.pdf`, role: 'reference',
      original_name: 'original.pdf' }]), snapshotNodeId(0));
}

export const snapshotConnection = (database: Database.Database) => createFakeCapacitorConnection(database);
