import type {
  NativeSyncNodeConflictRecord,
  NativeSyncObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import {
  loadIosPdfPageText,
  loadIosCompanionHostName,
  loadIosSyncIndex,
  loadIosSyncNodeConflicts,
  loadIosSyncObjects,
  searchIosPdfPageText
} from './companion/runtime/iosCompanionActiveDatabaseReads';
import { getIosCompanionSyncbackStore } from './companion/sync/syncback/iosCompanionSyncbackStore';
import { resolveCompanionSyncSettingRecord } from './companionSyncStateWriters';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  getNativeCompanionSyncbackPlatform,
  isNativeCompanionPdfPageTextRuntime,
  isNativeCompanionSyncObjectReadRuntime
} from './companionWorkspaceRuntimeRepository';

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
  saveCompanionSyncNodeOpenState,
  saveCompanionSyncNodeReadingRecord,
  saveCompanionSyncNodeReviewRecord,
  saveCompanionSyncNodeReviewRecordWithinWriterTask,
  saveCompanionSyncNodeViewState,
  saveCompanionSyncSettingRecord
} from './companionSyncStateWriters';
export { applyCompanionSyncObjects } from './companionSyncStateObjects';
export { applyCompanionSyncReviewLog } from './companionSyncReviewLogApply';

export async function loadCompanionSyncIndex() {
  if (!isNativeCompanionSyncObjectReadRuntime()) {
    return [];
  }
  return loadIosSyncIndex();
}

export async function loadCompanionSyncNodeConflicts() {
  if (!isNativeCompanionSyncObjectReadRuntime()) {
    return [] as NativeSyncNodeConflictRecord[];
  }
  return loadIosSyncNodeConflicts();
}

export async function loadCompanionSyncObjects(
  objectIds: string[],
  objectTypes?: Array<NativeSyncObjectRecord['object_type']>
) {
  if (!isNativeCompanionSyncObjectReadRuntime()) {
    return [];
  }
  return loadIosSyncObjects(objectIds, objectTypes);
}

export async function loadCompanionSyncSettingValueJson(key: string) {
  if (!isNativeCompanionSyncObjectReadRuntime()) return null;
  const record = resolveCompanionSyncSettingRecord({
    hostName: await loadIosCompanionHostName(), key
  });
  if (!record) return null;
  const [object] = await loadCompanionSyncObjects([record.objectId], ['setting']);
  if (!object?.payload_json) return null;
  try {
    const payload = JSON.parse(object.payload_json) as { key?: string; value_json?: unknown };
    return payload.key === key && typeof payload.value_json === 'string'
      ? payload.value_json
      : null;
  } catch {
    return null;
  }
}

export {
  loadCompanionMissingContentBlobBatch,
  loadCompanionMissingContentBlobHashes,
  loadCompanionMissingContentBlobs,
  syncCompanionContentBlob,
  syncCompanionContentBlobs
} from './companionContentBlobSync';

export {
  loadCompanionMissingAttachmentResource,
  loadCompanionMissingAttachmentResources
} from './companionAttachmentResourceSync';
export {
  applyCompanionDesktopSyncPack
} from './companionSyncPackApply';
export {
  loadCompanionPendingSyncSummary,
  loadCompanionSyncNodeVersionCursor,
  loadCompanionSyncNodeVersionPushCursor,
  loadCompanionSyncNodeVersions,
  loadCompanionSyncPackCursor,
  loadCompanionSyncReviewLog,
  loadCompanionSyncReviewLogCursor,
  loadCompanionSyncReviewLogPushCursor,
  loadCompanionSyncStateChanges,
  loadCompanionSyncStateCursor,
  loadCompanionSyncStatePushCursor,
  saveCompanionSyncNodeVersionCursor,
  saveCompanionSyncNodeVersionPushCursor,
  saveCompanionSyncPackCursor,
  saveCompanionSyncReviewLogCursor,
  saveCompanionSyncReviewLogPushCursor,
  saveCompanionSyncStateCursor,
  saveCompanionSyncStatePushCursor
} from './companionSyncCursors';
export {
  applyCompanionSyncNodeVersions,
  applyCompanionSyncNodeVersionsWithinWriterTask,
  applyCompanionTrashRestoreNodeVersions
} from './companionSyncNodeVersions';

export async function loadCompanionPdfPageText(attachmentId: string) {
  if (!isNativeCompanionPdfPageTextRuntime()) {
    return [] as CompanionPdfPageTextEntry[];
  }
  return loadIosPdfPageText(attachmentId);
}

export async function searchCompanionPdfPageText(query: string, limit?: number) {
  if (!isNativeCompanionPdfPageTextRuntime()) {
    return [] as CompanionPdfPageTextSearchResult[];
  }
  return searchIosPdfPageText(query, limit);
}

export async function saveCompanionSyncPushAcks(peerId: string, acks: SyncPushAck[]) {
  if (getNativeCompanionSyncbackPlatform() === null) return [] as string[];
  return runCompanionSyncWriterTask(() => getIosCompanionSyncbackStore().savePushAcks(peerId, acks));
}

export async function stageCompanionSyncPushItems(
  peerId: string,
  items: import('./companionSyncPushProtocol').SyncPushPayload[]
) {
  if (getNativeCompanionSyncbackPlatform() === null) return;
  return runCompanionSyncWriterTask(() => getIosCompanionSyncbackStore().stagePushItems(peerId, items));
}
