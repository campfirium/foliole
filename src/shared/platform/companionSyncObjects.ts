import type {
  NativeSyncChangeCursor,
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import {
  readWebCursor,
  readWebNumberCursor,
  writeWebCursor,
  writeWebNumberCursor
} from './companionSyncWebCursors';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

type SyncPushAck = import('./companionSyncPushProtocol').SyncPushAck;

export interface CompanionPdfPageTextEntry {
  page: number;
  page_height: number | null;
  page_width: number | null;
  text: string;
}

export interface CompanionPdfPageTextSearchResult extends CompanionPdfPageTextEntry {
  attachment_id: string;
  excerpt: string;
  match_start: number;
}
export {
  saveCompanionSyncActiveViewState,
  saveCompanionSyncNodeReadingRecord,
  saveCompanionSyncNodeReviewRecord,
  saveCompanionSyncNodeViewState,
  saveCompanionSyncSettingRecord
} from './companionSyncStateWriters';

export async function loadCompanionSyncIndex() {
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  return (await FolioleCompanionSync.loadSyncIndex()).entries;
}

export async function loadCompanionSyncNodeConflicts() {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as NativeSyncNodeConflictRecord[];
  }
  return (await FolioleCompanionSync.loadSyncNodeConflicts()).conflicts;
}

export async function loadCompanionSyncObjects(
  objectIds: string[],
  objectTypes?: Array<NativeSyncObjectRecord['object_type']>
) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  return (await FolioleCompanionSync.loadSyncObjects({
    object_ids: objectIds,
    object_types: objectTypes
  })).objects;
}

export async function applyCompanionSyncObjects(objects: NativeSyncObjectRecord[]) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  return (await FolioleCompanionSync.applySyncObjects({ objects })).applied_object_ids;
}

export async function applyCompanionSyncPack(packPath: string) {
  if (!isNativeAndroidCompanionRuntime()) {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  return FolioleCompanionSync.applySyncPack({ pack_path: packPath });
}

export async function applyCompanionDesktopSyncPack(args: {
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  return FolioleCompanionSync.applyDesktopSyncPack(args);
}

export {
  loadCompanionMissingContentBlobHashes,
  loadCompanionMissingContentBlobs,
  syncCompanionContentBlob,
  syncCompanionContentBlobs
} from './companionContentBlobSync';

export {
  loadCompanionMissingAttachmentResource,
  loadCompanionMissingAttachmentResources
} from './companionAttachmentResourceSync';

export async function applyCompanionSyncNodeVersions(nodes: NativeSyncNodeRecord[]) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  return (await FolioleCompanionSync.applySyncNodeVersions({ nodes })).applied_node_ids;
}

export async function applyCompanionSyncReviewLog(reviews: NativeSyncReviewLogRecord[]) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  return (await FolioleCompanionSync.applySyncReviewLog({ reviews })).applied_op_ids;
}

export async function loadCompanionPdfPageText(attachmentId: string) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as CompanionPdfPageTextEntry[];
  }
  return (await FolioleCompanionSync.loadPdfPageText({ attachment_id: attachmentId })).pages;
}

export async function searchCompanionPdfPageText(query: string, limit?: number) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as CompanionPdfPageTextSearchResult[];
  }
  return (await FolioleCompanionSync.searchPdfPageText({ limit, query })).results;
}

const WEB_SYNC_STATE_CURSOR_KEY = 'foliole-companion-sync-state-cursor';
const WEB_SYNC_PACK_CURSOR_KEY = 'foliole-companion-sync-pack-cursor';
const WEB_SYNC_STATE_PUSH_CURSOR_KEY = 'foliole-companion-sync-state-push-cursor';
const WEB_SYNC_NODE_VERSION_CURSOR_KEY = 'foliole-companion-sync-node-version-cursor';
const WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY = 'foliole-companion-sync-node-version-push-cursor';
const WEB_SYNC_REVIEW_LOG_CURSOR_KEY = 'foliole-companion-sync-review-log-cursor';
const WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY = 'foliole-companion-sync-review-log-push-cursor';

export async function loadCompanionSyncStateCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebNumberCursor(WEB_SYNC_STATE_CURSOR_KEY);
  }
  return (await FolioleCompanionSync.loadSyncStateCursor()).cursor;
}

export async function saveCompanionSyncStateCursor(cursor: number | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebNumberCursor(WEB_SYNC_STATE_CURSOR_KEY, cursor);
  }
  return (await FolioleCompanionSync.saveSyncStateCursor({ cursor })).cursor;
}

export async function loadCompanionSyncPackCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebNumberCursor(WEB_SYNC_PACK_CURSOR_KEY);
  }
  return (await FolioleCompanionSync.loadSyncPackCursor()).cursor;
}

export async function saveCompanionSyncPackCursor(cursor: number | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebNumberCursor(WEB_SYNC_PACK_CURSOR_KEY, cursor);
  }
  return (await FolioleCompanionSync.saveSyncPackCursor({ cursor })).cursor;
}

export async function loadCompanionSyncStatePushCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebNumberCursor(WEB_SYNC_STATE_PUSH_CURSOR_KEY);
  }
  return (await FolioleCompanionSync.loadSyncStatePushCursor()).cursor;
}

export async function saveCompanionSyncStatePushCursor(cursor: number | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebNumberCursor(WEB_SYNC_STATE_PUSH_CURSOR_KEY, cursor);
  }
  return (await FolioleCompanionSync.saveSyncStatePushCursor({ cursor })).cursor;
}

export async function loadCompanionSyncNodeVersionCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebCursor(WEB_SYNC_NODE_VERSION_CURSOR_KEY);
  }
  return (await FolioleCompanionSync.loadSyncNodeVersionCursor()).cursor;
}

export async function loadCompanionSyncNodeVersions(cursor: NativeSyncChangeCursor | null, limit = 500) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as NativeSyncNodeRecord[];
  }
  return (await FolioleCompanionSync.loadSyncNodeVersions({ cursor, limit })).nodes;
}

export async function saveCompanionSyncNodeVersionCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebCursor(WEB_SYNC_NODE_VERSION_CURSOR_KEY, cursor);
  }
  return (await FolioleCompanionSync.saveSyncNodeVersionCursor({ cursor })).cursor;
}

export async function loadCompanionSyncNodeVersionPushCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebCursor(WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY);
  }
  return (await FolioleCompanionSync.loadSyncNodeVersionPushCursor()).cursor;
}

export async function saveCompanionSyncNodeVersionPushCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebCursor(WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY, cursor);
  }
  return (await FolioleCompanionSync.saveSyncNodeVersionPushCursor({ cursor })).cursor;
}

export async function loadCompanionSyncReviewLogCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebCursor(WEB_SYNC_REVIEW_LOG_CURSOR_KEY);
  }
  return (await FolioleCompanionSync.loadSyncReviewLogCursor()).cursor;
}

export async function loadCompanionSyncReviewLog(cursor: NativeSyncChangeCursor | null, limit = 500) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as NativeSyncReviewLogRecord[];
  }
  return (await FolioleCompanionSync.loadSyncReviewLog({ cursor, limit })).reviews;
}

export async function saveCompanionSyncReviewLogCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebCursor(WEB_SYNC_REVIEW_LOG_CURSOR_KEY, cursor);
  }
  return (await FolioleCompanionSync.saveSyncReviewLogCursor({ cursor })).cursor;
}

export async function loadCompanionSyncReviewLogPushCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebCursor(WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY);
  }
  return (await FolioleCompanionSync.loadSyncReviewLogPushCursor()).cursor;
}

export async function saveCompanionSyncReviewLogPushCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebCursor(WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY, cursor);
  }
  return (await FolioleCompanionSync.saveSyncReviewLogPushCursor({ cursor })).cursor;
}

export async function saveCompanionSyncPushAcks(acks: SyncPushAck[]) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as string[];
  }
  return (await FolioleCompanionSync.saveSyncPushAcks({
    acks: acks.map((ack) => ({
      client_op_id: ack.clientOpId,
      identity: ack.identity,
      state_seq: ack.stateSeq,
      status: ack.status
    }))
  })).saved_client_op_ids;
}

export async function loadCompanionSyncStateChanges(cursor: number | null, limit = 500) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as NativeSyncStateObjectRecord[];
  }
  return (await FolioleCompanionSync.loadSyncStateChanges({ cursor, limit })).objects;
}

export async function loadCompanionPendingSyncSummary() {
  const [stateCursor, nodeCursor, reviewCursor] = await Promise.all([
    loadCompanionSyncStatePushCursor(),
    loadCompanionSyncNodeVersionPushCursor(),
    loadCompanionSyncReviewLogPushCursor()
  ]);
  const [stateChanges, nodeVersions, reviewLog] = await Promise.all([
    loadCompanionSyncStateChanges(stateCursor, 1),
    loadCompanionSyncNodeVersions(nodeCursor, 1),
    loadCompanionSyncReviewLog(reviewCursor, 1)
  ]);
  return {
    pendingCount: stateChanges.length + nodeVersions.length + reviewLog.length
  };
}
