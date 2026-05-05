import type {
  NativeWorkspaceReadingProfile,
  NativeWorkspaceReviewProfile
} from '../../../lib/platform/nativeStorageContract';
import type {
  NativeSyncChangeCursor,
  NativeSyncChangeRecord,
  NativeSyncObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

export async function loadCompanionSyncIndex() {
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  return (await FolioleCompanionSync.loadSyncIndex()).entries;
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

const WEB_SYNC_CHANGE_CURSOR_KEY = 'foliole-companion-sync-change-cursor';
const WEB_SYNC_PUSH_CURSOR_KEY = 'foliole-companion-sync-push-cursor';

function readWebSyncChangeCursor(): NativeSyncChangeCursor | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WEB_SYNC_CHANGE_CURSOR_KEY) ?? 'null') as NativeSyncChangeCursor | null;
    return parsed?.created_at && parsed.change_id ? parsed : null;
  } catch {
    return null;
  }
}

function writeWebSyncChangeCursor(cursor: NativeSyncChangeCursor | null) {
  if (typeof window !== 'undefined') {
    if (cursor) window.localStorage.setItem(WEB_SYNC_CHANGE_CURSOR_KEY, JSON.stringify(cursor));
    else window.localStorage.removeItem(WEB_SYNC_CHANGE_CURSOR_KEY);
  }
  return cursor;
}

function readWebCursor(key: string): NativeSyncChangeCursor | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as NativeSyncChangeCursor | null;
    return parsed?.created_at && parsed.change_id ? parsed : null;
  } catch {
    return null;
  }
}

function writeWebCursor(key: string, cursor: NativeSyncChangeCursor | null) {
  if (typeof window !== 'undefined') {
    if (cursor) window.localStorage.setItem(key, JSON.stringify(cursor));
    else window.localStorage.removeItem(key);
  }
  return cursor;
}

export async function loadCompanionSyncChangeCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebSyncChangeCursor();
  }
  return (await FolioleCompanionSync.loadSyncChangeCursor()).cursor;
}

export async function saveCompanionSyncChangeCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebSyncChangeCursor(cursor);
  }
  return (await FolioleCompanionSync.saveSyncChangeCursor({ cursor })).cursor;
}

export async function loadCompanionSyncPushCursor() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebCursor(WEB_SYNC_PUSH_CURSOR_KEY);
  }
  return (await FolioleCompanionSync.loadSyncPushCursor()).cursor;
}

export async function saveCompanionSyncPushCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebCursor(WEB_SYNC_PUSH_CURSOR_KEY, cursor);
  }
  return (await FolioleCompanionSync.saveSyncPushCursor({ cursor })).cursor;
}

export async function loadCompanionSyncChanges(cursor: NativeSyncChangeCursor | null, limit = 500) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as NativeSyncChangeRecord[];
  }
  return (await FolioleCompanionSync.loadSyncChanges({ cursor, limit })).changes;
}

export async function saveCompanionSyncSettingRecord(args: {
  key: string;
  valueJson: string;
  scope?: string;
  platform?: string;
  formFactor?: string;
  deviceId?: string;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncSettingRecord({
    device_id: args.deviceId ?? '*',
    form_factor: args.formFactor ?? 'phone',
    key: args.key,
    platform: args.platform ?? 'android',
    scope: args.scope ?? 'device',
    value_json: args.valueJson
  });
}

export async function saveCompanionSyncNodeReadingRecord(args: {
  nodeId: string;
  reading: NativeWorkspaceReadingProfile;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncNodeReadingRecord({
    node_id: args.nodeId,
    reading_json: JSON.stringify(args.reading)
  });
}

export async function saveCompanionSyncNodeReviewRecord(args: {
  nodeId: string;
  review: NativeWorkspaceReviewProfile;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncNodeReviewRecord({
    node_id: args.nodeId,
    review_json: JSON.stringify(args.review)
  });
}

export async function saveCompanionSyncActiveViewState(nodeId: string | null) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncActiveViewState({ node_id: nodeId });
}

export async function saveCompanionSyncNodeViewState(args: {
  nodeId: string;
  scrollTop: number;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  return FolioleCompanionSync.saveSyncNodeViewState({
    node_id: args.nodeId,
    scroll_top: Math.max(0, Math.trunc(args.scrollTop))
  });
}
