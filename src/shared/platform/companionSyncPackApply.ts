import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract';

import { loadCompanionBootstrapState } from './companionBootstrap';
import { applyCompanionSyncPackPathWithSharedCore } from './companionSyncPackNodes';
import {
  deleteCompanionDownloadedSyncPack,
  downloadCompanionDesktopSyncPack
} from './companionSyncPackTransfer';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceRuntimeRepository';

export async function applyCompanionDesktopSyncPack(args: {
  headers: Record<string, string>;
  url: string;
}): Promise<NativeSyncPackApplyResult> {
  if (!isNativeAndroidCompanionRuntime()) {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  const packPath = await downloadCompanionDesktopSyncPack(args);
  if (!packPath) {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  try {
    return await runCompanionSyncWriterTask(async () => {
      const bootstrap = await loadCompanionBootstrapState();
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
