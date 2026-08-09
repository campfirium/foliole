import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult
} from '../database/companionSyncPushTypes.js';

interface CompanionSyncPushResponse {
  acks: Array<{
    canonical_object_id?: string;
    client_op_id: string;
    conflict_reason?: string;
    identity: CompanionSyncPushPayload['identity'];
    state_seq?: number | null;
    status: 'accepted' | 'already_applied' | 'conflict' | 'rejected';
    version_id?: string | null;
  }>;
}

type ApplyCompanionSyncPush = (
  items: CompanionSyncPushPayload[],
  sourceDeviceId: string
) => Promise<CompanionSyncPushResult>;
type NotifyWorkspaceSyncApplied = (event: {
  appliedNodeIds: string[];
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
}) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPushItem(value: unknown): value is CompanionSyncPushPayload {
  if (!isRecord(value) || !isRecord(value.identity) || !isRecord(value.base)) return false;
  return typeof value.clientOpId === 'string'
    && typeof value.identity.objectId === 'string'
    && typeof value.identity.objectType === 'string'
    && typeof value.identity.scope === 'string'
    && (value.payloadJson === null || typeof value.payloadJson === 'string');
}

function readPushItems(bodyText: string): CompanionSyncPushPayload[] {
  const payload = JSON.parse(bodyText) as unknown;
  if (!isRecord(payload) || !Array.isArray(payload.items) || payload.items.some((item) => !isPushItem(item))) {
    throw new Error('invalid_sync_push_payload');
  }
  return payload.items;
}

export async function handleCompanionSyncPushWithApply(
  bodyText: string,
  authenticatedDeviceId: string,
  apply: ApplyCompanionSyncPush,
  notify: NotifyWorkspaceSyncApplied
) {
  const result = await apply(readPushItems(bodyText), authenticatedDeviceId);
  notify({
    appliedNodeIds: result.appliedNodeIds,
    appliedObjectIds: result.appliedObjectIds,
    appliedReviewOpIds: result.appliedReviewOpIds
  });
  return {
    acks: result.acks.map((ack) => ({
      ...(ack.canonicalObjectId === undefined ? {} : { canonical_object_id: ack.canonicalObjectId }),
      client_op_id: ack.clientOpId,
      ...(ack.conflictReason === undefined ? {} : { conflict_reason: ack.conflictReason }),
      identity: ack.identity,
      ...(ack.stateSeq === undefined ? {} : { state_seq: ack.stateSeq }),
      status: ack.status,
      ...(ack.versionId === undefined ? {} : { version_id: ack.versionId })
    }))
  } satisfies CompanionSyncPushResponse;
}
