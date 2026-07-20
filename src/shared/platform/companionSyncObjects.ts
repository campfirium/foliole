import type {
  NativeSyncNodeConflictRecord,
  NativeSyncObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import { getIosCompanionLearningSyncbackStore } from './companion/sync/learning-syncback/iosCompanionLearningSyncbackStore';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  FolioleCompanionSync,
  getNativeCompanionLearningSyncbackPlatform,
  isNativeAndroidCompanionRuntime,
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
  saveCompanionSyncNodeReadingRecord,
  saveCompanionSyncNodeReviewRecord,
  saveCompanionSyncNodeViewState,
  saveCompanionSyncSettingRecord
} from './companionSyncStateWriters';
export { applyCompanionSyncObjects } from './companionSyncStateObjects';
export { applyCompanionSyncReviewLog } from './companionSyncReviewLogApply';

export async function loadCompanionSyncIndex() {
  if (!isNativeCompanionSyncObjectReadRuntime()) {
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
  if (!isNativeCompanionSyncObjectReadRuntime()) {
    return [];
  }
  return (await FolioleCompanionSync.loadSyncObjects({
    object_ids: objectIds,
    ...(objectTypes ? { object_types: objectTypes } : {})
  })).objects;
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
export { applyCompanionSyncNodeVersions } from './companionSyncNodeVersions';

export async function loadCompanionPdfPageText(attachmentId: string) {
  if (!isNativeCompanionPdfPageTextRuntime()) {
    return [] as CompanionPdfPageTextEntry[];
  }
  return (await FolioleCompanionSync.loadPdfPageText({ attachment_id: attachmentId })).pages;
}

export async function searchCompanionPdfPageText(query: string, limit?: number) {
  if (!isNativeCompanionPdfPageTextRuntime()) {
    return [] as CompanionPdfPageTextSearchResult[];
  }
  return (await FolioleCompanionSync.searchPdfPageText({ ...(limit !== undefined ? { limit } : {}), query })).results;
}

export async function saveCompanionSyncPushAcks(acks: SyncPushAck[]) {
  if (getNativeCompanionLearningSyncbackPlatform() === 'ios') {
    return runCompanionSyncWriterTask(() => getIosCompanionLearningSyncbackStore().savePushAcks(acks));
  }
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as string[];
  }
  return runCompanionSyncWriterTask(async () => (
    await FolioleCompanionSync.saveSyncPushAcks({
      acks: acks.map((ack) => ({
        client_op_id: ack.clientOpId,
        identity: ack.identity,
        ...(ack.stateSeq !== undefined ? { state_seq: ack.stateSeq } : {}),
        status: ack.status
      }))
    })
  ).saved_client_op_ids);
}
