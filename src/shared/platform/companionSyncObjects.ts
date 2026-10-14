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
import { resolveCompanionSyncSettingRecord } from './companionSyncStateWriters';
import {
  isNativeCompanionPdfPageTextRuntime,
  isNativeCompanionSyncObjectReadRuntime
} from './companionWorkspaceRuntimeRepository';


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

export async function loadCompanionSyncSettingValueJson(key: string, objectId?: string) {
  if (!isNativeCompanionSyncObjectReadRuntime()) return null;
  const record = objectId
    ? null
    : resolveCompanionSyncSettingRecord({
        hostName: await loadIosCompanionHostName(),
        key
      });
  const resolvedObjectId = objectId ?? record?.objectId;
  if (!resolvedObjectId) return null;
  const [object] = await loadCompanionSyncObjects([resolvedObjectId], ['setting']);
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
  loadCompanionMissingAttachmentResource,
  loadCompanionMissingAttachmentResources
} from './companionAttachmentResourceSync';
export {
  applyCompanionLocalNodeVersions,
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

export async function searchCompanionPdfPageText(query: string, limit?: number, offset = 0) {
  if (!isNativeCompanionPdfPageTextRuntime()) {
    return [] as CompanionPdfPageTextSearchResult[];
  }
  return searchIosPdfPageText(query, limit, offset);
}
