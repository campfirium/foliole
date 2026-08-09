import { postDesktopJson } from './companionDesktopSyncHttp';
import {
  loadCompanionSyncReviewLog,
  loadCompanionSyncNodeVersions,
  loadCompanionSyncStateChanges,
  saveCompanionSyncPushAcks,
  stageCompanionSyncPushItems
} from './companionSyncObjects';
import {
  nodeVersionSyncAdapter,
  nodeOpenStateSyncAdapter,
  nodeReadingSyncAdapter,
  nodeReviewSyncAdapter,
  nodeTextAlternativeSyncAdapter,
  reviewLogSyncAdapter,
  settingSyncAdapter,
  viewStateSyncAdapter,
  type SyncPushAck
} from './companionSyncPushProtocol';
import { loadCompanionPairingState } from './companionWorkspacePairing';

const SYNC_PUSH_PATH = '/companion/sync-push';

export interface CompanionDesktopSyncPushResult {
  pushConflictCount: number;
  pushedObjectIds: string[];
  pushedReviewOpIds: string[];
  pushError: string | null;
  pushRejectedCount: number;
}

interface DesktopSyncPushResponse {
  acks: Array<{
    canonical_object_id?: string;
    client_op_id: string;
    conflict_reason?: string;
    identity: SyncPushAck['identity'];
    state_seq?: number | null;
    status: SyncPushAck['status'];
    version_id?: string | null;
  }>;
}

function toPushAck(raw: DesktopSyncPushResponse['acks'][number]): SyncPushAck {
  if (
    raw.identity.objectType === 'node'
    && (raw.status === 'accepted' || raw.status === 'already_applied')
    && typeof raw.version_id !== 'string'
  ) {
    return {
      clientOpId: raw.client_op_id,
      conflictReason: 'missing_version_id',
      identity: raw.identity,
      status: 'rejected'
    };
  }
  if (
    raw.identity.objectType !== 'review_log'
    && raw.identity.objectType !== 'node'
    && (raw.status === 'accepted' || raw.status === 'already_applied')
    && typeof raw.state_seq !== 'number'
  ) {
    return {
      clientOpId: raw.client_op_id,
      conflictReason: 'missing_state_seq',
      identity: raw.identity,
      status: 'rejected'
    };
  }
  return {
    ...(raw.canonical_object_id !== undefined ? { canonicalObjectId: raw.canonical_object_id } : {}),
    clientOpId: raw.client_op_id,
    ...(raw.conflict_reason !== undefined ? { conflictReason: raw.conflict_reason } : {}),
    identity: raw.identity,
    ...(raw.state_seq !== undefined ? { stateSeq: raw.state_seq } : {}),
    status: raw.status,
    ...(raw.version_id !== undefined ? { versionId: raw.version_id } : {})
  };
}

const statePushAdapters = {
  node_open_state: nodeOpenStateSyncAdapter,
  node_reading: nodeReadingSyncAdapter,
  node_review: nodeReviewSyncAdapter,
  node_text_alternative: nodeTextAlternativeSyncAdapter,
  setting: settingSyncAdapter,
  view_state: viewStateSyncAdapter
} as const;

async function collectLocalPushItems(peerId: string) {
  const [nodeVersions, stateChanges, reviewLog] = await Promise.all([
    loadCompanionSyncNodeVersions(peerId, null, 100),
    loadCompanionSyncStateChanges(peerId, null, 100),
    loadCompanionSyncReviewLog(peerId, null, 100)
  ]);
  const nodeItems = nodeVersions
    .map((row) => nodeVersionSyncAdapter.buildPushPayload(row))
    .filter((item) => item.base.kind !== 'blocked');
  const stateItems = stateChanges
    .map((row) => statePushAdapters[row.object_type as keyof typeof statePushAdapters]?.buildPushPayload(row))
    .filter((item) => item !== undefined)
    .filter((item) => item.base.kind !== 'blocked');
  const pushableReviewNodeIds = new Set(stateItems
    .filter((item) => item.identity.objectType === 'node_review')
    .map((item) => item.identity.objectId));
  return {
    items: [
      ...nodeItems,
      ...stateItems,
      ...reviewLog
        .filter((row) => pushableReviewNodeIds.has(row.node_id))
        .map((row) => reviewLogSyncAdapter.buildPushPayload(row))
    ],
    nodeVersions
  };
}

function acceptedAcks(acks: SyncPushAck[]) {
  return acks.filter((ack) => ack.status === 'accepted' || ack.status === 'already_applied');
}

function countAcksByStatus(acks: SyncPushAck[], status: SyncPushAck['status']) {
  return acks.filter((ack) => ack.status === status).length;
}

function formatPushError(error: unknown) {
  return error instanceof Error ? error.message : 'Desktop sync push failed.';
}

export async function pushLocalDirtyObjects(endpointUrl: string): Promise<CompanionDesktopSyncPushResult> {
  try {
    const pairing = await loadCompanionPairingState();
    const peerId = pairing.remote_peer_id?.trim();
    if (!peerId) throw new Error('sync_delivery_peer_identity_unavailable');
    const { items } = await collectLocalPushItems(peerId);
    if (items.length === 0) {
      return {
        pushConflictCount: 0,
        pushedObjectIds: [],
        pushedReviewOpIds: [],
        pushError: null,
        pushRejectedCount: 0
      };
    }
    await stageCompanionSyncPushItems(peerId, items);
    const response = await postDesktopJson<DesktopSyncPushResponse>(endpointUrl, SYNC_PUSH_PATH, { items });
    const acks = response.acks.map(toPushAck);
    const accepted = acceptedAcks(acks);
    await saveCompanionSyncPushAcks(peerId, acks);
    return {
      pushedObjectIds: accepted
        .filter((ack) => ack.identity.objectType !== 'review_log')
        .map((ack) => `${ack.identity.objectType}:${ack.identity.objectId}`),
      pushedReviewOpIds: accepted
        .filter((ack) => ack.identity.objectType === 'review_log')
        .map((ack) => ack.identity.objectId),
      pushConflictCount: countAcksByStatus(acks, 'conflict'),
      pushError: null,
      pushRejectedCount: countAcksByStatus(acks, 'rejected')
    };
  } catch (error) {
    return {
      pushConflictCount: 0,
      pushedObjectIds: [],
      pushedReviewOpIds: [],
      pushError: formatPushError(error),
      pushRejectedCount: 0
    };
  }
}
