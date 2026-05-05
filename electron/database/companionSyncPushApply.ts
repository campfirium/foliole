import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type {
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncObjectType
} from '../../lib/platform/nativeSyncContract.js';

import { applyReviewLogPush } from './companionSyncPushReviewLogApply.js';
import { openDatabaseConnection } from './connection.js';
import { applySyncNodes } from './syncApply.js';
import { applySyncObjectPayload } from './syncObjectApplyPayloads.js';

const REMOTE_DEVICE_ID = 'companion-push';

type SyncPushStatus = 'accepted' | 'already_applied' | 'conflict' | 'rejected';

type SyncBaseReference =
  | { kind: 'blocked'; reason: 'invalid_identity' | 'missing_base_reference' }
  | { baseContentHash: string | null; kind: 'content_hash' }
  | { kind: 'op_id'; opId: string }
  | { ancestorVersionIds: string[]; kind: 'node_version'; parentVersionId: string | null };

export interface SyncObjectIdentity {
  objectId: string;
  objectType: string;
  scope: string;
}

export interface CompanionSyncPushPayload {
  base: SyncBaseReference;
  clientOpId: string;
  contentHash?: string;
  deletedAt?: string | null;
  identity: SyncObjectIdentity;
  payloadJson: string | null;
  updatedAt?: string;
}

interface CompanionSyncPushAck {
  clientOpId: string;
  conflictReason?: string;
  desktopBase?: SyncBaseReference;
  identity: SyncObjectIdentity;
  stateSeq?: number | null;
  status: SyncPushStatus;
  versionId?: string | null;
}

interface SyncObjectStateRow extends DatabaseRow {
  content_hash: string;
  deleted_at: string | null;
  state_seq: number;
  updated_at: string;
}

export interface CompanionSyncPushResult {
  acks: CompanionSyncPushAck[];
  appliedNodeIds: string[];
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function rejectAck(item: CompanionSyncPushPayload, reason: string): CompanionSyncPushAck {
  return {
    clientOpId: item.clientOpId,
    conflictReason: reason,
    identity: item.identity,
    status: 'rejected'
  };
}

function currentState(driver: DatabaseDriver, identity: SyncObjectIdentity) {
  return driver.queryOne<SyncObjectStateRow>(
    `SELECT content_hash, deleted_at, state_seq, updated_at
     FROM sync_object_state
     WHERE object_type = ? AND object_id = ?`,
    [identity.objectType, identity.objectId]
  );
}

function desktopBase(row: SyncObjectStateRow | undefined): SyncBaseReference | undefined {
  return row ? { baseContentHash: row.content_hash, kind: 'content_hash' } : undefined;
}

type StatePushObjectType = Extract<NativeSyncObjectType, 'node_reading' | 'node_review' | 'setting' | 'view_state'>;

function validStateObjectScope(item: CompanionSyncPushPayload, objectType: StatePushObjectType) {
  if (objectType === 'setting' || objectType === 'view_state') {
    const parts = item.identity.objectId.split(':', 5);
    return parts.length === 5
      && parts.every((part) => part.trim().length > 0)
      && item.identity.scope === parts[0];
  }
  return item.identity.scope === 'workspace';
}

function buildStateObjectRecord(
  item: CompanionSyncPushPayload,
  objectType: StatePushObjectType
): NativeSyncObjectRecord | null {
  if (item.identity.objectType !== objectType || !validStateObjectScope(item, objectType)) return null;
  const contentHash = readString(item.contentHash);
  const updatedAt = readString(item.updatedAt);
  if (!contentHash || !updatedAt) return null;
  return {
    content_hash: contentHash,
    deleted_at: item.deletedAt ?? null,
    object_id: item.identity.objectId,
    object_type: objectType,
    payload_json: item.payloadJson,
    updated_at: updatedAt
  };
}

function stateAck(
  item: CompanionSyncPushPayload,
  row: SyncObjectStateRow | undefined,
  status: Extract<SyncPushStatus, 'accepted' | 'already_applied'>
): CompanionSyncPushAck {
  return {
    clientOpId: item.clientOpId,
    desktopBase: desktopBase(row),
    identity: item.identity,
    stateSeq: row?.state_seq ?? null,
    status
  };
}

function applyStateObjectPush(
  driver: DatabaseDriver,
  item: CompanionSyncPushPayload,
  objectType: StatePushObjectType
): CompanionSyncPushResult {
  return driver.transaction((transactionDriver) => {
    const current = currentState(transactionDriver, item.identity);
    const record = buildStateObjectRecord(item, objectType);
    if (!record || item.base.kind !== 'content_hash') {
      return { acks: [rejectAck(item, `invalid_${objectType}_push`)], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
    }
    if (current?.content_hash === record.content_hash && current.deleted_at === record.deleted_at) {
      return {
        acks: [stateAck(item, current, 'already_applied')],
        appliedNodeIds: [],
        appliedObjectIds: [],
        appliedReviewOpIds: []
      };
    }
    if (
      (current && current.content_hash !== item.base.baseContentHash)
      || (!current && item.base.baseContentHash !== null)
    ) {
      return {
        acks: [{
          clientOpId: item.clientOpId,
          conflictReason: 'base_content_hash_mismatch',
          desktopBase: desktopBase(current),
          identity: item.identity,
          stateSeq: current?.state_seq ?? null,
          status: 'conflict'
        }],
        appliedNodeIds: [],
        appliedObjectIds: [],
        appliedReviewOpIds: []
      };
    }
    applySyncObjectPayload(transactionDriver, record);
    upsertSyncObjectState(transactionDriver, {
      contentHash: record.content_hash,
      deletedAt: record.deleted_at,
      lastModifiedByDeviceId: REMOTE_DEVICE_ID,
      objectId: record.object_id,
      objectType: record.object_type,
      syncDirty: false,
      updatedAt: record.updated_at
    });
    const updated = currentState(transactionDriver, item.identity);
    return {
      acks: [stateAck(item, updated, 'accepted')],
      appliedNodeIds: [],
      appliedObjectIds: [`${objectType}:${record.object_id}`],
      appliedReviewOpIds: []
    };
  });
}

function parseNodeRecord(item: CompanionSyncPushPayload): NativeSyncNodeRecord | null {
  if (item.identity.objectType !== 'node' || item.identity.scope !== 'workspace' || item.base.kind !== 'node_version') {
    return null;
  }
  if (!item.payloadJson) {
    return null;
  }
  const record = JSON.parse(item.payloadJson) as NativeSyncNodeRecord;
  if (
    record.object_type !== 'node'
    || record.object_id !== item.identity.objectId
    || !record.version_id
    || !record.device_id
    || !record.version_created_at
    || record.parent_version_id !== item.base.parentVersionId
  ) {
    return null;
  }
  return {
    ...record,
    ancestor_version_ids: item.base.ancestorVersionIds,
    content_hash: item.contentHash ?? record.content_hash,
    updated_at: item.updatedAt ?? record.updated_at
  };
}

function applyNodeVersionPush(item: CompanionSyncPushPayload): CompanionSyncPushResult {
  const record = parseNodeRecord(item);
  if (!record) {
    return { acks: [rejectAck(item, 'invalid_node_push')], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
  }
  const appliedNodeIds = applySyncNodes([record], { includeAlreadyApplied: true });
  return {
    acks: [{
      clientOpId: item.clientOpId,
      conflictReason: appliedNodeIds.includes(record.object_id) ? undefined : 'node_version_conflict',
      identity: item.identity,
      status: appliedNodeIds.includes(record.object_id) ? 'accepted' : 'conflict',
      versionId: record.version_id
    }],
    appliedNodeIds,
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
}

function applySinglePushItem(driver: DatabaseDriver, item: CompanionSyncPushPayload): CompanionSyncPushResult {
  try {
    if (item.identity.objectType === 'node') {
      return applyNodeVersionPush(item);
    }
    if (
      item.identity.objectType === 'node_reading'
      || item.identity.objectType === 'node_review'
      || item.identity.objectType === 'setting'
      || item.identity.objectType === 'view_state'
    ) {
      return applyStateObjectPush(driver, item, item.identity.objectType);
    }
    if (item.identity.objectType === 'review_log') {
      return applyReviewLogPush(driver, item);
    }
    return { acks: [rejectAck(item, 'unsupported_object_type')], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
  } catch (error) {
    return {
      acks: [rejectAck(item, error instanceof Error ? error.message : 'apply_failed')],
      appliedNodeIds: [],
      appliedObjectIds: [],
      appliedReviewOpIds: []
    };
  }
}

export function applyCompanionSyncPush(items: CompanionSyncPushPayload[]): CompanionSyncPushResult {
  const driver = openDatabaseConnection().driver;
  return items.reduce<CompanionSyncPushResult>((result, item) => {
    const itemResult = applySinglePushItem(driver, item);
    result.acks.push(...itemResult.acks);
    result.appliedNodeIds.push(...itemResult.appliedNodeIds);
    result.appliedObjectIds.push(...itemResult.appliedObjectIds);
    result.appliedReviewOpIds.push(...itemResult.appliedReviewOpIds);
    return result;
  }, { acks: [], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] });
}
