import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';

export async function seedAttachmentThroughputFixture(db: DbPort, keys: string[]) {
  const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(7))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  await db.run("INSERT INTO sync_groups VALUES ('group', 'Throughput fixture', ?, 'now', 'now')", [secret]);
  await db.run("INSERT INTO sync_group_local_state VALUES (1, 'group', 'peer', 'active', 'now')");
  await db.run("UPDATE node_version_local_proof_state SET library_epoch = 'peer-epoch'");
  for (const device of ['peer', 'local']) await db.run(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, ?, 'android', 'active', 'now', 'now')`, [device, `${device}-anchor`, `/${device}`, device]);
  await db.transaction(async tx => {
    for (let start = 0; start < 30000; start += 100) {
      const ids = Array.from({ length: 100 }, (_, i) => `scale-${String(start + i).padStart(6, '0')}`);
      await tx.run(`INSERT INTO nodes (id,title,content,created_at,updated_at,current_version_id) VALUES ${ids.map(() => "(?,'Scale',?,'now','now','scale')").join(',')}`,
        ids.flatMap(id => [id, 'body '.repeat(100)]));
      await tx.run(`INSERT INTO framed_sync_node_digest (object_id,shared_state_hash,unready) VALUES ${ids.map(() => '(?,?,0)').join(',')}`,
        ids.flatMap(id => [id, bytesToHex(sha256(new TextEncoder().encode(id)))]));
    }
    await tx.run('UPDATE nodes SET resource_references = ? WHERE id = ?', [JSON.stringify(keys.map(storage_key =>
      ({ storage_key, role: 'reference', original_name: null }))), 'scale-000000']);
  });
}
