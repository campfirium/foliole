import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { recordFramedSyncPeerEpoch } from '../../lib/core/sync/framedSyncPeerEpoch.js';
import { applyNodeMemberPosition } from '../../lib/core/sync/nodeVersionMemberPositionApply.js';
import { nodePositionFactId, nodePositionPayloadSchema, type NodePositionPayload } from '../../lib/core/sync/nodeVersionMemberPositionFact.js';
import { hashText } from '../../lib/core/sync/syncNodeResolution.js';

export async function receiveMemberPositionFixture(port: DbPort, input: NodePositionPayload) {
  const payload = nodePositionPayloadSchema.parse(input);
  await port.transaction(async tx => {
    await recordFramedSyncPeerEpoch(tx, { groupId: payload.group_id,
      peerDeviceId: payload.device_identity_key, libraryEpoch: payload.library_epoch,
      transferId: new Uint8Array(16) });
    await applyNodeMemberPosition(tx, { object_type: 'node_position', object_id: nodePositionFactId(payload),
      content_hash: hashText(JSON.stringify(payload)), payload_json: JSON.stringify(payload),
      deleted_at: null, updated_at: payload.updated_at });
  });
}
