import type {
  NativeSyncChangeCursor,
  NativeSyncNodeRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';
import { resolveRemoteSyncGroupDevices } from '../../../lib/platform/syncGroupContract';

import {
  loadIosCompanionChangeCursor,
  loadIosCompanionNumberCursor,
  saveIosCompanionChangeCursor,
  saveIosCompanionNumberCursor
} from './companion/runtime/iosCompanionSyncCursorStore';
import { createIosCompanionSyncPackCursorStore } from './companion/sync/cursor/iosCompanionSyncPackCursorStore';
import { getIosCompanionSyncbackStore } from './companion/sync/syncback/iosCompanionSyncbackStore';
import { loadCompanionSyncGroup } from './companion/sync/syncGroupStore';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  readWebCursor,
  readWebNumberCursor,
  writeWebCursor,
  writeWebNumberCursor
} from './companionSyncWebCursors';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import { getNativeCompanionSyncbackPlatform } from './companionWorkspaceRuntimeRepository';

const WEB_SYNC_STATE_CURSOR_KEY = 'foliole-companion-sync-state-cursor';
const WEB_SYNC_PACK_CURSOR_KEY = 'foliole-companion-sync-pack-cursor';
const WEB_SYNC_STATE_PUSH_CURSOR_KEY = 'foliole-companion-sync-state-push-cursor';
const WEB_SYNC_NODE_VERSION_CURSOR_KEY = 'foliole-companion-sync-node-version-cursor';
const WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY = 'foliole-companion-sync-node-version-push-cursor';
const WEB_SYNC_REVIEW_LOG_CURSOR_KEY = 'foliole-companion-sync-review-log-cursor';
const WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY = 'foliole-companion-sync-review-log-push-cursor';
async function getSyncPackPeerId() {
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const devices = resolveRemoteSyncGroupDevices(group);
  if (devices.length !== 1) throw new Error('sync_pack_source_device_ambiguous');
  return devices[0]!.device_identity_key;
}

export async function loadCompanionSyncStateCursor() {
  if (usesSharedOwner()) return loadIosCompanionNumberCursor('state');
  return readWebNumberCursor(WEB_SYNC_STATE_CURSOR_KEY);
}

export async function saveCompanionSyncStateCursor(cursor: number | null) {
  if (usesSharedOwner()) return saveIosCompanionNumberCursor('state', cursor);
  return writeWebNumberCursor(WEB_SYNC_STATE_CURSOR_KEY, cursor);
}

export async function loadCompanionSyncPackCursor(peerId?: string) {
  if (usesSharedOwner()) {
    return createIosCompanionSyncPackCursorStore(undefined, peerId ?? await getSyncPackPeerId()).loadCursor();
  }
  return readWebNumberCursor(WEB_SYNC_PACK_CURSOR_KEY);
}

export async function saveCompanionSyncPackCursor(cursor: number | null, peerId?: string) {
  if (usesSharedOwner()) {
    const store = createIosCompanionSyncPackCursorStore(undefined, peerId ?? await getSyncPackPeerId());
    return runCompanionSyncWriterTask(() => store.saveCursor(cursor));
  }
  return writeWebNumberCursor(WEB_SYNC_PACK_CURSOR_KEY, cursor);
}

export async function loadCompanionSyncStatePushCursor() {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return getIosCompanionSyncbackStore().loadStatePushCursor();
  }
  return readWebNumberCursor(WEB_SYNC_STATE_PUSH_CURSOR_KEY);
}

export async function saveCompanionSyncStatePushCursor(cursor: number | null) {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return runCompanionSyncWriterTask(() => getIosCompanionSyncbackStore().saveStatePushCursor(cursor));
  }
  return writeWebNumberCursor(WEB_SYNC_STATE_PUSH_CURSOR_KEY, cursor);
}

export async function loadCompanionSyncNodeVersionCursor() {
  if (usesSharedOwner()) return loadIosCompanionChangeCursor('nodeVersion');
  return readWebCursor(WEB_SYNC_NODE_VERSION_CURSOR_KEY);
}

export async function saveCompanionSyncNodeVersionCursor(cursor: NativeSyncChangeCursor | null) {
  if (usesSharedOwner()) return saveIosCompanionChangeCursor('nodeVersion', cursor);
  return writeWebCursor(WEB_SYNC_NODE_VERSION_CURSOR_KEY, cursor);
}

export async function loadCompanionSyncNodeVersionPushCursor() {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return getIosCompanionSyncbackStore().loadNodeVersionPushCursor();
  }
  return readWebCursor(WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY);
}

export async function saveCompanionSyncNodeVersionPushCursor(cursor: NativeSyncChangeCursor | null) {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return runCompanionSyncWriterTask(() => getIosCompanionSyncbackStore().saveNodeVersionPushCursor(cursor));
  }
  return writeWebCursor(WEB_SYNC_NODE_VERSION_PUSH_CURSOR_KEY, cursor);
}

export async function loadCompanionSyncReviewLogCursor() {
  if (usesSharedOwner()) return loadIosCompanionChangeCursor('reviewLog');
  return readWebCursor(WEB_SYNC_REVIEW_LOG_CURSOR_KEY);
}

export async function saveCompanionSyncReviewLogCursor(cursor: NativeSyncChangeCursor | null) {
  if (usesSharedOwner()) return saveIosCompanionChangeCursor('reviewLog', cursor);
  return writeWebCursor(WEB_SYNC_REVIEW_LOG_CURSOR_KEY, cursor);
}

export async function loadCompanionSyncReviewLogPushCursor() {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return getIosCompanionSyncbackStore().loadReviewLogPushCursor();
  }
  return readWebCursor(WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY);
}

export async function saveCompanionSyncReviewLogPushCursor(cursor: NativeSyncChangeCursor | null) {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return runCompanionSyncWriterTask(() => getIosCompanionSyncbackStore().saveReviewLogPushCursor(cursor));
  }
  return writeWebCursor(WEB_SYNC_REVIEW_LOG_PUSH_CURSOR_KEY, cursor);
}

export async function loadCompanionSyncNodeVersions(
  peerId: string,
  cursor: NativeSyncChangeCursor | null,
  limit = 500
) {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return getIosCompanionSyncbackStore().loadNodeVersions(peerId, cursor, limit);
  }
  return [] as NativeSyncNodeRecord[];
}

export async function loadCompanionSyncReviewLog(
  peerId: string,
  cursor: NativeSyncChangeCursor | null,
  limit = 500
) {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return getIosCompanionSyncbackStore().loadReviewLog(peerId, cursor, limit);
  }
  return [] as NativeSyncReviewLogRecord[];
}

export async function loadCompanionSyncStateChanges(peerId: string, cursor: number | null, limit = 500) {
  if (getNativeCompanionSyncbackPlatform() !== null) {
    return getIosCompanionSyncbackStore().loadStateChanges(peerId, cursor, limit);
  }
  return [] as NativeSyncStateObjectRecord[];
}

export async function loadCompanionPendingSyncSummary() {
  const group = await loadCompanionSyncGroup();
  if (!group) return { pendingCount: 0 };
  const peerId = resolveRemoteSyncGroupDevices(group)[0]?.device_identity_key;
  if (!peerId) return { pendingCount: 0 };
  const [stateCursor, nodeCursor, reviewCursor] = await Promise.all([
    loadCompanionSyncStatePushCursor(),
    loadCompanionSyncNodeVersionPushCursor(),
    loadCompanionSyncReviewLogPushCursor()
  ]);
  const [stateChanges, nodeVersions, reviewLog] = await Promise.all([
    loadCompanionSyncStateChanges(peerId, stateCursor, 1),
    loadCompanionSyncNodeVersions(peerId, nodeCursor, 1),
    loadCompanionSyncReviewLog(peerId, reviewCursor, 1)
  ]);
  return { pendingCount: stateChanges.length + nodeVersions.length + reviewLog.length };
}

function usesSharedOwner() {
  const kind = getCompanionRuntimeCapability().kind;
  return kind === 'android-native' || kind === 'ios-native';
}
