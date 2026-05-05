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
  nodeReviewSyncAdapter,
  reviewLogSyncAdapter,
  type SyncPushAck
} from './companionSyncPushProtocol';

const SYNC_PUSH_PATH = '/companion/sync-push';

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
    .filter((row) => row.object_type === 'node_review')
    .map((row) => nodeReviewSyncAdapter.buildPushPayload(row))
    .filter((item) => item.base.kind !== 'blocked');
  return {
    items: [...stateItems, ...reviewLog.map((row) => reviewLogSyncAdapter.buildPushPayload(row))],
    reviewLog
  };
}

function acceptedAcks(acks: SyncPushAck[]) {
  return acks.filter((ack) => ack.status === 'accepted' || ack.status === 'already_applied');
}

export async function pushLocalDirtyObjects(endpointUrl: string) {
  try {
    const { items, reviewLog } = await collectLocalPushItems();
    if (items.length === 0) {
      return { pushedObjectIds: [] as string[], pushedReviewOpIds: [] as string[] };
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
        .map((ack) => ack.identity.objectId)
    };
  } catch {
    return { pushedObjectIds: [] as string[], pushedReviewOpIds: [] as string[] };
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
