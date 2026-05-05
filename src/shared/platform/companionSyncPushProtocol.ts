import type {
  NativeSyncObjectType,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

export type SyncPushStatus = 'accepted' | 'already_applied' | 'conflict' | 'rejected';

export type SyncLocalStatus = 'conflict' | 'dirty' | 'pending_ack' | 'ready_to_push' | 'rejected';

export interface SyncObjectIdentity {
  objectId: string;
  objectType: NativeSyncObjectType | 'review_log';
  scope: string;
}

export type SyncBaseReference =
  | { kind: 'blocked'; reason: 'missing_base_reference' }
  | { baseContentHash: string; kind: 'content_hash' }
  | { kind: 'op_id'; opId: string }
  | { ancestorVersionIds: string[]; kind: 'node_version'; parentVersionId: string | null };

export interface SyncPushPayload {
  base: SyncBaseReference;
  clientOpId: string;
  contentHash?: string;
  deletedAt?: string | null;
  identity: SyncObjectIdentity;
  payloadJson: string | null;
  updatedAt?: string;
}

export interface SyncPushAck {
  clientOpId: string;
  conflictReason?: string;
  desktopBase?: SyncBaseReference;
  identity: SyncObjectIdentity;
  stateSeq?: number | null;
  status: SyncPushStatus;
  versionId?: string | null;
}

export interface SyncApplyResult {
  identity: SyncObjectIdentity;
  status: 'applied' | 'blocked_by_dirty' | 'ignored';
}

export interface SyncableObjectAdapter<LocalRow, PullPayload> {
  applyPullPayload(payload: PullPayload): SyncApplyResult;
  baseReference(row: LocalRow): SyncBaseReference;
  buildPushPayload(row: LocalRow): SyncPushPayload;
  identity(row: LocalRow | PullPayload): SyncObjectIdentity;
  isConfirmedBy(payload: PullPayload, ack: SyncPushAck): boolean;
}

export interface SyncableStateObjectRow extends NativeSyncStateObjectRecord {
  base_content_hash?: string | null;
  local_status?: SyncLocalStatus;
}

export interface SyncableReviewLogRow extends NativeSyncReviewLogRecord {
  state_seq?: number | null;
}

function canonicalIdentityKey(identity: SyncObjectIdentity) {
  return `${identity.objectType}:${identity.scope}:${identity.objectId}`;
}

function sameIdentity(left: SyncObjectIdentity, right: SyncObjectIdentity) {
  return canonicalIdentityKey(left) === canonicalIdentityKey(right);
}

function stateObjectIdentity(row: Pick<NativeSyncStateObjectRecord, 'object_id' | 'object_type'>): SyncObjectIdentity {
  return {
    objectId: row.object_id,
    objectType: row.object_type,
    scope: row.object_type === 'setting' ? row.object_id.split(':', 1)[0] || 'setting' : 'workspace'
  };
}

function stateClientOpId(row: NativeSyncStateObjectRecord) {
  return `${row.object_type}:${row.object_id}:${row.state_seq}`;
}

function createStateObjectSyncAdapter(
  objectType: 'node_reading' | 'node_review' | 'setting'
): SyncableObjectAdapter<SyncableStateObjectRow, NativeSyncStateObjectRecord> {
  return {
    applyPullPayload(payload) {
      return {
        identity: stateObjectIdentity(payload),
        status: payload.object_type === objectType ? 'applied' : 'ignored'
      };
    },
    baseReference(row) {
      return row.base_content_hash
        ? { baseContentHash: row.base_content_hash, kind: 'content_hash' }
        : { kind: 'blocked', reason: 'missing_base_reference' };
    },
    buildPushPayload(row) {
      return {
        base: this.baseReference(row),
        clientOpId: stateClientOpId(row),
        contentHash: row.content_hash,
        deletedAt: row.deleted_at,
        identity: this.identity(row),
        payloadJson: row.payload_json,
        updatedAt: row.updated_at
      };
    },
    identity(row) {
      return stateObjectIdentity(row);
    },
    isConfirmedBy(payload, ack) {
      return payload.object_type === objectType
        && sameIdentity(this.identity(payload), ack.identity)
        && ack.status !== 'conflict'
        && ack.status !== 'rejected'
        && typeof ack.stateSeq === 'number'
        && payload.state_seq >= ack.stateSeq;
    }
  };
}

export const nodeReadingSyncAdapter = createStateObjectSyncAdapter('node_reading');

export const nodeReviewSyncAdapter = createStateObjectSyncAdapter('node_review');

export const settingSyncAdapter = createStateObjectSyncAdapter('setting');

function reviewLogIdentity(row: Pick<NativeSyncReviewLogRecord, 'op_id'>): SyncObjectIdentity {
  return {
    objectId: row.op_id,
    objectType: 'review_log',
    scope: 'workspace'
  };
}

export const reviewLogSyncAdapter: SyncableObjectAdapter<SyncableReviewLogRow, SyncableReviewLogRow> = {
  applyPullPayload(payload) {
    return {
      identity: reviewLogIdentity(payload),
      status: 'applied'
    };
  },
  baseReference(row) {
    return { kind: 'op_id', opId: row.op_id };
  },
  buildPushPayload(row) {
    return {
      base: this.baseReference(row),
      clientOpId: `review_log:${row.op_id}`,
      identity: this.identity(row),
      payloadJson: JSON.stringify(row)
    };
  },
  identity(row) {
    return reviewLogIdentity(row);
  },
  isConfirmedBy(payload, ack) {
    return sameIdentity(this.identity(payload), ack.identity)
      && (ack.status === 'accepted' || ack.status === 'already_applied');
  }
};

export const syncPushAdapters = {
  node_reading: nodeReadingSyncAdapter,
  node_review: nodeReviewSyncAdapter,
  setting: settingSyncAdapter,
  review_log: reviewLogSyncAdapter
} as const;
