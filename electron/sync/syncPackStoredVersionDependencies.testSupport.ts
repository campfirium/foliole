import { bytesToHex } from '@noble/hashes/utils.js';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { isNodeVersionIdentityOnly } from '../../lib/core/sync/syncNodeVersionHistory.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { context, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

export function branch(id: string, body: string, parent?: NativeSyncNodeRecord,
  at = '2026-05-04T02:00:00.000Z'): NativeSyncNodeRecord {
  const record = textBranch(id, body, parent, at);
  record.object_id = 'node-1'; record.snapshot.id = 'node-1'; record.snapshot.title = 'Packed Node';
  record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: body });
  return record;
}

export function identity(record: NativeSyncNodeRecord): NativeSyncNodeRecord {
  return { ...record, body_text: null, snapshot: { ...record.snapshot, content: null, body_blob_hash: null } };
}

export async function receive(source: RestorePeer, target: RestorePeer, records: NativeSyncNodeRecord[]) {
  const bodies = new Map<string, Uint8Array>();
  const facts = records.flatMap(record => {
    if (isNodeVersionIdentityOnly(record)) return [projectFramedSyncNodeIdentityFact(record)];
    const projection = projectFramedSyncNodeRecord(record);
    for (const blob of projection.manifest.blobs) if (blob.role === 1) bodies.set(bytesToHex(blob.sha256), projection.bodyBlob);
    for (const alternative of projection.alternativeBodyBlobs ?? []) bodies.set(bytesToHex(alternative.blob.sha256), alternative.data);
    return projection.manifest.facts;
  });
  return applyRequestSyncObject(target.db, {
    context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
    peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
      library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
    objectType: 'node', globalId: 'node-1', requestId: new Uint8Array(16),
    facts: async function* () { yield* facts; }, loadBody: async (_db, blob) => {
      const body = bodies.get(bytesToHex(blob.sha256));
      if (!body) throw new Error('test_body_missing');
      return body;
    }
  });
}

export function business(peer: RestorePeer) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'node_sync_tombstones', 'sync_object_state',
    'node_version_member_positions', 'node_version_local_source_revisions', 'node_version_device_revisions']
    .map(table => peer.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

export function retiredVersionRow(row: Record<string, unknown> & { snapshot_json: string }) {
  return { ...row, body_text: null,
    snapshot_json: JSON.stringify({ ...JSON.parse(row.snapshot_json), content: null, body_deleted: true }) };
}
