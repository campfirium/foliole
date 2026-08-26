import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';
import type { SyncPushAck, SyncPushPayload } from '../../../companionSyncPushProtocol';

export async function stagePushDeliveries(port: DbPort, authorizationId: string, items: SyncPushPayload[]) {
  const now = new Date().toISOString();
  await port.transaction(async (tx) => {
    for (const item of items) {
      const delivery = deliveryIdentity(item);
      await tx.run(
        `INSERT OR IGNORE INTO sync_delivery_receipts (
          peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
          local_position, status, remote_position, issue_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
        [authorizationId, delivery.stream, item.clientOpId, item.identity.objectType, item.identity.objectId,
          delivery.payloadIdentity, delivery.localPosition, now, now]
      );
      const stored = (await tx.query<DbRow>(
        `SELECT payload_identity FROM sync_delivery_receipts
         WHERE peer_id = ? AND stream_name = ? AND operation_id = ?`,
        [authorizationId, delivery.stream, item.clientOpId]
      ))[0];
      if (stored?.payload_identity !== delivery.payloadIdentity) {
        throw new Error('sync_delivery_operation_identity_mismatch');
      }
    }
  });
}

export async function savePeerPushAcksWithinTransaction(port: DbPort, authorizationId: string, acks: SyncPushAck[]) {
  const saved: string[] = [];
  for (const ack of acks) {
    const delivery = ackDelivery(ack);
    if (!delivery) continue;
    const result = await port.run(
      `UPDATE sync_delivery_receipts SET status = ?, remote_position = ?, issue_reason = ?, updated_at = ?
       WHERE peer_id = ? AND stream_name = ? AND operation_id = ?`,
      [delivery.status, delivery.remotePosition, ack.conflictReason ?? null, new Date().toISOString(),
        authorizationId, delivery.stream, ack.clientOpId]
    );
    if (result.changes > 0) saved.push(ack.clientOpId);
  }
  return saved;
}

function deliveryIdentity(item: SyncPushPayload) {
  if (item.identity.objectType === 'node') {
    const versionId = item.clientOpId.startsWith('node:') ? item.clientOpId.slice(5) : '';
    if (!versionId) throw new Error('invalid_sync_delivery_node_identity');
    return { localPosition: versionId, payloadIdentity: versionId, stream: 'node_version' };
  }
  if (item.identity.objectType === 'review_log') {
    const opId = item.identity.objectId;
    return { localPosition: opId, payloadIdentity: opId, stream: 'review_log' };
  }
  if (!item.contentHash) throw new Error('invalid_sync_delivery_state_identity');
  return {
    localPosition: item.clientOpId.split(':').at(-1) ?? '',
    payloadIdentity: item.contentHash,
    stream: 'state'
  };
}

function ackDelivery(ack: SyncPushAck) {
  const confirming = ack.status === 'accepted' || ack.status === 'already_applied';
  const stream = ack.identity.objectType === 'node'
    ? 'node_version'
    : ack.identity.objectType === 'review_log' ? 'review_log' : 'state';
  if (confirming && stream === 'state' && typeof ack.stateSeq !== 'number') return null;
  return {
    remotePosition: stream === 'state' ? String(ack.stateSeq) : null,
    status: confirming && stream !== 'state' ? 'confirmed' : confirming ? 'accepted' : ack.status,
    stream
  };
}
