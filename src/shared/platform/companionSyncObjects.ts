import type {
  NativeSyncNodeConflictRecord,
  NativeSyncObjectRecord,
  NativeSyncReviewLogRecord
} from '../../../lib/platform/nativeSyncContract';

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
export { applyCompanionSyncNodeVersions } from './companionSyncNodeVersions';

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
