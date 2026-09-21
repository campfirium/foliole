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
  const order = database.prepare('INSERT INTO node_order VALUES (?, ?)');
  database.transaction(() => {
    for (let index = 0; index < SNAPSHOT_NODE_COUNT; index++) {
      const parent = index === 0 ? null : snapshotNodeId(index === 1202 ? 1201 : 0);
      node.run(snapshotNodeId(index), parent, `Title ${index}`, index === 17 ? '' : `Body ${index}`,
        stamp, stamp, index === 1201 ? stamp : null);
      order.run(snapshotNodeId(index), SNAPSHOT_NODE_COUNT - index);
    }
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
  database.prepare('INSERT INTO attachments VALUES (?, ?, ?, ?, ?)')
    .run('attachment', 'original.pdf', 'application/pdf', 10, stamp);
  database.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run(snapshotNodeId(0), 'attachment', 'reference');
}

export const snapshotConnection = (database: Database.Database) => createFakeCapacitorConnection(database);
