import Database from 'better-sqlite3';

import { decodeFramedSyncManifest, encodeFramedSyncManifest } from '../../lib/core/database/framedSyncStagingSerialization.js';
import { canonicalContentId, canonicalTransferIdSync, type CanonicalManifest } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

/** Converts this test's frozen production publications into one pre-upgrade mixed publication. */
export async function freezeLegacyOrderPublication(file: string) {
  const db = new Database(file);
  try {
    const rows = db.prepare<[], { manifest_json: string }>(
      "SELECT manifest_json FROM framed_sync_outbound_publications WHERE state = 'published'").all();
    const manifests = rows.map(row => decodeFramedSyncManifest(row.manifest_json));
    const manifest: CanonicalManifest = { facts: manifests.flatMap(value => value.facts),
      blobs: [...new Map(manifests.flatMap(value => value.blobs)
        .map(blob => [Buffer.from(blob.sha256).toString('hex'), blob])).values()] };
    if (!manifest.facts.some(fact => fact.objectType === 'node') ||
        !manifest.facts.some(fact => fact.objectType === 'parent_child_order')) throw new Error('mixed_fixture_required');
    const contentId = await canonicalContentId(manifest);
    const transferId = canonicalTransferIdSync({ protocolVersion: 22, groupId: 't326-group',
      senderDeviceId: 'desktop-a', senderLibraryEpoch: 'desktop-a-epoch',
      receiverDeviceId: 'desktop-b', receiverLibraryEpoch: 'desktop-b-epoch' }, contentId);
    await createBetterSqliteDbPort(db).transaction(async tx => {
      await tx.run('DELETE FROM framed_sync_outbound_publications');
      await tx.run(`INSERT INTO framed_sync_outbound_publications
        (transfer_id, content_id, manifest_hash, canonical_manifest, manifest_json, protocol_version,
          group_id, sender_device_id, sender_library_epoch, receiver_device_id, receiver_library_epoch,
          fact_count, blob_count, total_blob_bytes, state)
        VALUES (?, ?, ?, ?, ?, 22, 't326-group', 'desktop-a', 'desktop-a-epoch',
          'desktop-b', 'desktop-b-epoch', ?, ?, ?, 'published')`,
      [transferId, contentId, contentId, new Uint8Array(), encodeFramedSyncManifest(manifest),
        manifest.facts.length, manifest.blobs.length, manifest.blobs.reduce((sum, blob) => sum + blob.byteLength, 0n)]);
      for (const fact of manifest.facts) await tx.run('INSERT INTO framed_sync_outbound_fact_refs VALUES (?, ?, ?, ?, ?)',
        [transferId, fact.kind, fact.objectType, fact.globalId, fact.factId]);
      for (const blob of manifest.blobs) await tx.run('INSERT INTO framed_sync_outbound_blob_refs VALUES (?, ?, ?, ?, ?)',
        [transferId, blob.sha256, blob.byteLength, blob.role, blob.required ? 1 : 0]);
      await tx.run("INSERT INTO framed_sync_outbound_holds VALUES (?, 'desktop-b')", [transferId]);
      for (const name of ['insert', 'update', 'delete']) await tx.run(`DROP TRIGGER trg_parent_order_node_${name}`);
      for (const table of ['parent_order_sources', 'parent_order_writer', 'parent_order_projection_pending']) {
        await tx.run(`DROP TABLE ${table}`);
      }
      await tx.run('ALTER TABLE framed_sync_outbound_publications DROP COLUMN retirement_reason');
      await tx.run('PRAGMA user_version = 151');
    });
    return transferId;
  } finally { db.close(); }
}
