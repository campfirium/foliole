import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract';

import { applyIosCompanionSyncPackPath } from './companion/sync/pack-apply/iosCompanionSyncPackApply';
import { loadCompanionBootstrapState } from './companionBootstrap';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import { applyCompanionSyncPackPathWithSharedCore } from './companionSyncPackNodes';
import {
  deleteCompanionDownloadedSyncPack,
  downloadCompanionDesktopSyncPack
} from './companionSyncPackTransfer';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  FolioleCompanionSync
} from './companionWorkspaceRuntimeRepository';

export async function applyCompanionDesktopSyncPack(args: {
  headers: Record<string, string>;
  url: string;
}): Promise<NativeSyncPackApplyResult> {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  const bootstrap = await loadCompanionBootstrapState();
  const packPath = await downloadCompanionDesktopSyncPack(args);
  if (!packPath) {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  try {
    if (runtime.kind === 'ios-native') {
      return await applyIosCompanionSyncPackPath({ deviceId: bootstrap.device_id, packPath });
    }
    return await runCompanionSyncWriterTask(async () => {
      return await applyCompanionSyncPackPathWithSharedCore({
        deviceId: bootstrap.device_id,
        packPath
      }, {
        loadCursor: async () => (await FolioleCompanionSync.loadSyncPackCursor()).cursor,
        saveCursor: async (cursor) => (await FolioleCompanionSync.saveSyncPackCursor({ cursor })).cursor
      });
    });
  } finally {
    await deleteCompanionDownloadedSyncPack(packPath);
  }
}
