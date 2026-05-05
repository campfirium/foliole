import type {
  NativeSyncChangeCursor,
  NativeSyncNodeRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import {
  readWebCursor,
  readWebNumberCursor,
  writeWebCursor,
  writeWebNumberCursor
} from './companionSyncWebCursors';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

const WEB_SYNC_STATE_CURSOR_KEY = 'foliole-companion-sync-state-cursor';
const WEB_SYNC_PACK_CURSOR_KEY = 'foliole-companion-sync-pack-cursor';
const WEB_SYNC_STATE_PUSH_CURSOR_KEY = 'foliole-companion-sync-state-push-cursor';
const WEB_SYNC_NODE_VERSION_CURSOR_KEY = 'foliole-companion-sync-node-version-cursor';
const WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY = 'foliole-companion-sync-node-version-push-cursor';
const WEB_SYNC_REVIEW_LOG_CURSOR_KEY = 'foliole-companion-sync-review-log-cursor';
const WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY = 'foliole-companion-sync-review-log-push-cursor';

export async function loadCompanionSyncStateCursor() {
  if (!isNativeAndroidCompanionRuntime()) return readWebNumberCursor(WEB_SYNC_STATE_CURSOR_KEY);
  return (await FolioleCompanionSync.loadSyncStateCursor()).cursor;
}

export async function saveCompanionSyncStateCursor(cursor: number | null) {
  if (!isNativeAndroidCompanionRuntime()) return writeWebNumberCursor(WEB_SYNC_STATE_CURSOR_KEY, cursor);
  return runCompanionSyncWriterTask(async () => (
    await FolioleCompanionSync.saveSyncStateCursor({ cursor })
  ).cursor);
}

export async function loadCompanionSyncPackCursor() {
  if (!isNativeAndroidCompanionRuntime()) return readWebNumberCursor(WEB_SYNC_PACK_CURSOR_KEY);
  return (await FolioleCompanionSync.loadSyncPackCursor()).cursor;
}

export async function saveCompanionSyncPackCursor(cursor: number | null) {
  if (!isNativeAndroidCompanionRuntime()) return writeWebNumberCursor(WEB_SYNC_PACK_CURSOR_KEY, cursor);
  return runCompanionSyncWriterTask(async () => (
    await FolioleCompanionSync.saveSyncPackCursor({ cursor })
  ).cursor);
}

export async function loadCompanionSyncStatePushCursor() {
  if (!isNativeAndroidCompanionRuntime()) return readWebNumberCursor(WEB_SYNC_STATE_PUSH_CURSOR_KEY);
  return (await FolioleCompanionSync.loadSyncStatePushCursor()).cursor;
}

export async function saveCompanionSyncStatePushCursor(cursor: number | null) {
  if (!isNativeAndroidCompanionRuntime()) return writeWebNumberCursor(WEB_SYNC_STATE_PUSH_CURSOR_KEY, cursor);
  return runCompanionSyncWriterTask(async () => (
    await FolioleCompanionSync.saveSyncStatePushCursor({ cursor })
  ).cursor);
}

export async function loadCompanionSyncNodeVersionCursor() {
  if (!isNativeAndroidCompanionRuntime()) return readWebCursor(WEB_SYNC_NODE_VERSION_CURSOR_KEY);
  return (await FolioleCompanionSync.loadSyncNodeVersionCursor()).cursor;
}

export async function saveCompanionSyncNodeVersionCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) return writeWebCursor(WEB_SYNC_NODE_VERSION_CURSOR_KEY, cursor);
  return runCompanionSyncWriterTask(async () => (
    await FolioleCompanionSync.saveSyncNodeVersionCursor({ cursor })
  ).cursor);
}

export async function loadCompanionSyncNodeVersionPushCursor() {
  if (!isNativeAndroidCompanionRuntime()) return readWebCursor(WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY);
  return (await FolioleCompanionSync.loadSyncNodeVersionPushCursor()).cursor;
}

export async function saveCompanionSyncNodeVersionPushCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) return writeWebCursor(WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY, cursor);
  return runCompanionSyncWriterTask(async () => (
    await FolioleCompanionSync.saveSyncNodeVersionPushCursor({ cursor })
  ).cursor);
}

export async function loadCompanionSyncReviewLogCursor() {
  if (!isNativeAndroidCompanionRuntime()) return readWebCursor(WEB_SYNC_REVIEW_LOG_CURSOR_KEY);
  return (await FolioleCompanionSync.loadSyncReviewLogCursor()).cursor;
}

export async function saveCompanionSyncReviewLogCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) return writeWebCursor(WEB_SYNC_REVIEW_LOG_CURSOR_KEY, cursor);
  return runCompanionSyncWriterTask(async () => (
    await FolioleCompanionSync.saveSyncReviewLogCursor({ cursor })
  ).cursor);
}

export async function loadCompanionSyncReviewLogPushCursor() {
  if (!isNativeAndroidCompanionRuntime()) return readWebCursor(WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY);
  return (await FolioleCompanionSync.loadSyncReviewLogPushCursor()).cursor;
}

export async function saveCompanionSyncReviewLogPushCursor(cursor: NativeSyncChangeCursor | null) {
  if (!isNativeAndroidCompanionRuntime()) return writeWebCursor(WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY, cursor);
  return runCompanionSyncWriterTask(async () => (
    await FolioleCompanionSync.saveSyncReviewLogPushCursor({ cursor })
  ).cursor);
}

export async function loadCompanionSyncNodeVersions(cursor: NativeSyncChangeCursor | null, limit = 500) {
  if (!isNativeAndroidCompanionRuntime()) return [] as NativeSyncNodeRecord[];
  return (await FolioleCompanionSync.loadSyncNodeVersions({ cursor, limit })).nodes;
}

export async function loadCompanionSyncReviewLog(cursor: NativeSyncChangeCursor | null, limit = 500) {
  if (!isNativeAndroidCompanionRuntime()) return [] as NativeSyncReviewLogRecord[];
  return (await FolioleCompanionSync.loadSyncReviewLog({ cursor, limit })).reviews;
}

export async function loadCompanionSyncStateChanges(cursor: number | null, limit = 500) {
  if (!isNativeAndroidCompanionRuntime()) return [] as NativeSyncStateObjectRecord[];
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
  return { pendingCount: stateChanges.length + nodeVersions.length + reviewLog.length };
}
