import { recordFramedSyncPeerEpoch } from '../../lib/core/sync/framedSyncPeerEpoch.js';
import { applyNodeMemberPosition } from '../../lib/core/sync/nodeVersionMemberPositionApply.js';
import { nodePositionFactId, nodePositionPayloadSchema } from '../../lib/core/sync/nodeVersionMemberPositionFact.js';
import { publishLocalNodePosition } from '../../lib/core/sync/nodeVersionMemberPositionPublish.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';

import type { Peer } from './syncEmptyLibraryTestSupport.js';

/** Exchange the peer's actual declaration after the fixture has transferred its node facts. */
export async function receiveMemberPosition(receiver: Peer, author: Peer) {
  await author.port.transaction(db => publishLocalNodePosition(db, 'topic'));
  const raw = author.db.prepare(`SELECT adopted_version_id, device_identity_key, group_id,
    library_epoch, object_id, pending_version_ids_json, proof_revision, updated_at
    FROM node_version_member_positions WHERE device_identity_key = ? AND object_id = 'topic'`).get(author.id);
  if (!raw) return;
  const payload = nodePositionPayloadSchema.parse(raw);
  const versions = [payload.adopted_version_id, ...JSON.parse(payload.pending_version_ids_json) as string[]];
  if (versions.some(id => !receiver.db.prepare('SELECT 1 FROM node_sync_versions WHERE version_id = ?').get(id))) return;
  await receiver.port.transaction(async db => {
    await recordFramedSyncPeerEpoch(db, { groupId: 'group', libraryEpoch: payload.library_epoch,
      peerDeviceId: author.id, transferId: new Uint8Array(32) });
    await applyNodeMemberPosition(db, { object_type: 'node_position', object_id: nodePositionFactId(payload),
      content_hash: hashText(JSON.stringify(payload)), payload_json: JSON.stringify(payload),
      deleted_at: null, updated_at: payload.updated_at });
  });
}
