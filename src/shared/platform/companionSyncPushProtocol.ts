import type {
  NativeSyncNodeRecord,
  NativeSyncObjectType,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import { isValidStateObjectIdentity, stateObjectIdentity } from './companionSyncStateObjectIdentity';

export type SyncPushStatus = 'accepted' | 'already_applied' | 'conflict' | 'rejected';

export type SyncLocalStatus = 'conflict' | 'dirty' | 'pending_ack' | 'ready_to_push' | 'rejected';

export interface SyncObjectIdentity {
  objectId: string;
  objectType: NativeSyncObjectType | 'review_log';
  scope: string;
}

export type SyncBaseReference =
  | { kind: 'blocked'; reason: 'invalid_identity' | 'missing_base_reference' }
  | { baseContentHash: string | null; kind: 'content_hash' }
  | { kind: 'op_id'; opId: string }
  | { ancestorVersionIds: string[]; kind: 'node_version'; parentVersionId: string | null; parentVersionIds?: string[] };

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
  canonicalObjectId?: string;
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
  applyPullPayload(payload: PullPayload, localRow?: LocalRow | null): SyncApplyResult;
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

export type SyncableNodeVersionRow = NativeSyncNodeRecord;

function canonicalIdentityKey(identity: SyncObjectIdentity) {
  return `${identity.objectType}:${identity.scope}:${identity.objectId}`;
}

function sameIdentity(left: SyncObjectIdentity, right: SyncObjectIdentity) {
  return canonicalIdentityKey(left) === canonicalIdentityKey(right);
}

function stateClientOpId(row: NativeSyncStateObjectRecord) {
  return `${row.object_type}:${row.object_id}:${row.state_seq}`;
}

function createStateObjectSyncAdapter(
  objectType: 'node_open_state' | 'node_reading' | 'node_review' | 'node_text_alternative' | 'setting' | 'view_state'
): SyncableObjectAdapter<SyncableStateObjectRow, NativeSyncStateObjectRecord> {
  return {
    applyPullPayload(payload, localRow) {
      return {
        identity: stateObjectIdentity(payload),
        status: resolveStateApplyStatus(payload, objectType, localRow)
      };
    },
    baseReference(row) {
      if (!isValidStateObjectIdentity(row)) {
        return { kind: 'blocked', reason: 'invalid_identity' };
      }
      return { baseContentHash: row.base_content_hash ?? null, kind: 'content_hash' };
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

function resolveStateApplyStatus(
  payload: NativeSyncStateObjectRecord,
  objectType: 'node_open_state' | 'node_reading' | 'node_review' | 'node_text_alternative' | 'setting' | 'view_state',
  localRow?: SyncableStateObjectRow | null
): SyncApplyResult['status'] {
  if (payload.object_type !== objectType) return 'ignored';
  if (objectType === 'view_state' || objectType === 'node_open_state') return 'applied';
  if (!localRow || !sameIdentity(stateObjectIdentity(payload), stateObjectIdentity(localRow))) return 'applied';
  if (localRow.local_status && localRow.local_status !== 'ready_to_push') return 'blocked_by_dirty';
  return localRow.local_status === 'ready_to_push' ? 'blocked_by_dirty' : 'applied';
}

export const nodeReadingSyncAdapter = createStateObjectSyncAdapter('node_reading');

export const nodeOpenStateSyncAdapter = createStateObjectSyncAdapter('node_open_state');

export const nodeReviewSyncAdapter = createStateObjectSyncAdapter('node_review');

export const nodeTextAlternativeSyncAdapter = createStateObjectSyncAdapter('node_text_alternative');

export const settingSyncAdapter = createStateObjectSyncAdapter('setting');

export const viewStateSyncAdapter = createStateObjectSyncAdapter('view_state');

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

function nodeVersionIdentity(row: Pick<NativeSyncNodeRecord, 'object_id'>): SyncObjectIdentity {
  return {
    objectId: row.object_id,
    objectType: 'node',
    scope: 'workspace'
  };
}

export const nodeVersionSyncAdapter: SyncableObjectAdapter<SyncableNodeVersionRow, SyncableNodeVersionRow> = {
  applyPullPayload(payload) {
    return {
      identity: nodeVersionIdentity(payload),
      status: 'applied'
    };
  },
  baseReference(row) {
    if (!row.version_id || !row.device_id || !row.version_created_at) {
      return { kind: 'blocked', reason: 'missing_base_reference' };
    }
    return {
      ancestorVersionIds: row.ancestor_version_ids,
      kind: 'node_version',
      parentVersionId: row.parent_version_id,
      parentVersionIds: row.parent_version_ids ?? (row.parent_version_id ? [row.parent_version_id] : [])
    };
  },
  buildPushPayload(row) {
    return {
      base: this.baseReference(row),
      clientOpId: `node:${row.version_id ?? row.object_id}`,
      ...(row.content_hash ? { contentHash: row.content_hash } : {}),
      identity: this.identity(row),
      payloadJson: JSON.stringify(row),
      updatedAt: row.updated_at
    };
  },
  identity(row) {
    return nodeVersionIdentity(row);
  },
  isConfirmedBy(payload, ack) {
    return sameIdentity(this.identity(payload), ack.identity)
      && (ack.status === 'accepted' || ack.status === 'already_applied')
      && typeof payload.version_id === 'string'
      && ack.versionId === payload.version_id;
  }
};

export const syncPushAdapters = {
  node: nodeVersionSyncAdapter,
  node_open_state: nodeOpenStateSyncAdapter,
  node_reading: nodeReadingSyncAdapter,
  node_review: nodeReviewSyncAdapter,
  node_text_alternative: nodeTextAlternativeSyncAdapter,
  setting: settingSyncAdapter,
  view_state: viewStateSyncAdapter,
  review_log: reviewLogSyncAdapter
} as const;
