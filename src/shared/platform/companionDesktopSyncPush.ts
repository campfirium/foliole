import { postDesktopJson } from './companionDesktopSyncHttp';
import {
  loadCompanionSyncReviewLog,
  loadCompanionSyncReviewLogPushCursor,
  loadCompanionSyncStateChanges,
  loadCompanionSyncStatePushCursor,
  saveCompanionSyncReviewLogPushCursor,
  saveCompanionSyncPushAcks
} from './companionSyncObjects';
import {
  nodeReadingSyncAdapter,
  nodeReviewSyncAdapter,
  reviewLogSyncAdapter,
  settingSyncAdapter,
  viewStateSyncAdapter,
  type SyncPushAck
} from './companionSyncPushProtocol';

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
    client_op_id: string;
    conflict_reason?: string;
    identity: SyncPushAck['identity'];
    state_seq?: number | null;
    status: SyncPushAck['status'];
  }>;
}

function toPushAck(raw: DesktopSyncPushResponse['acks'][number]): SyncPushAck {
  return {
    clientOpId: raw.client_op_id,
    conflictReason: raw.conflict_reason,
    identity: raw.identity,
    stateSeq: raw.state_seq,
    status: raw.status
  };
}

const statePushAdapters = {
  node_reading: nodeReadingSyncAdapter,
  node_review: nodeReviewSyncAdapter,
  setting: settingSyncAdapter,
  view_state: viewStateSyncAdapter
} as const;

async function collectLocalPushItems() {
  const [stateCursor, reviewCursor] = await Promise.all([
    loadCompanionSyncStatePushCursor(),
    loadCompanionSyncReviewLogPushCursor()
  ]);
  const [stateChanges, reviewLog] = await Promise.all([
    loadCompanionSyncStateChanges(stateCursor, 100),
    loadCompanionSyncReviewLog(reviewCursor, 100)
  ]);
  const stateItems = stateChanges
    .map((row) => statePushAdapters[row.object_type as keyof typeof statePushAdapters]?.buildPushPayload(row))
    .filter((item) => item !== undefined)
    .filter((item) => item.base.kind !== 'blocked');
  return {
    items: [...stateItems, ...reviewLog.map((row) => reviewLogSyncAdapter.buildPushPayload(row))],
    reviewLog
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
    const { items, reviewLog } = await collectLocalPushItems();
    if (items.length === 0) {
      return {
        pushConflictCount: 0,
        pushedObjectIds: [],
        pushedReviewOpIds: [],
        pushError: null,
        pushRejectedCount: 0
      };
    }
    const response = await postDesktopJson<DesktopSyncPushResponse>(endpointUrl, SYNC_PUSH_PATH, { items });
    const acks = response.acks.map(toPushAck);
    const accepted = acceptedAcks(acks);
    await saveCompanionSyncPushAcks(accepted.filter((ack) => ack.identity.objectType !== 'review_log'));
    await saveAcceptedReviewLogPushCursor(reviewLog, accepted);
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

async function saveAcceptedReviewLogPushCursor(
  reviewLog: Awaited<ReturnType<typeof loadCompanionSyncReviewLog>>,
  acks: SyncPushAck[]
) {
  const acceptedOpIds = new Set(
    acks
      .filter((ack) => ack.identity.objectType === 'review_log')
      .map((ack) => ack.identity.objectId)
  );
  let confirmed = null as null | { change_id: string; created_at: string };
  for (const row of reviewLog) {
    if (!acceptedOpIds.has(row.op_id)) {
      break;
    }
    confirmed = { change_id: row.op_id, created_at: row.reviewed_at };
  }
  if (confirmed) {
    await saveCompanionSyncReviewLogPushCursor(confirmed);
  }
}
