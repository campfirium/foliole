import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract';

import { applyIosCompanionSyncPackPath } from './companion/sync/pack-apply/iosCompanionSyncPackApply';
import { loadCompanionBootstrapState } from './companionBootstrap';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  deleteCompanionDownloadedSyncPack,
  downloadCompanionDesktopSyncPack
} from './companionSyncPackTransfer';

export async function applyCompanionDesktopSyncPack(args: {
  headers: Record<string, string>;
  sourceHostName?: string;
  sourcePeerId: string;
  url: string;
}): Promise<NativeSyncPackApplyResult> {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  if (!args.sourceHostName?.trim()) throw new Error('sync_group_source_host_unavailable');
  const bootstrap = await loadCompanionBootstrapState();
  if (!bootstrap.host_name) throw new Error('companion_host_name_missing');
  const packPath = await downloadCompanionDesktopSyncPack({
    ...args,
    expectedPeerId: bootstrap.device_id,
    expectedSourcePeerId: args.sourcePeerId
  });
  if (!packPath) {
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }
  try {
    return await applyIosCompanionSyncPackPath({
      deviceId: bootstrap.device_id, hostName: bootstrap.host_name,
      packPath, sourceHostName: args.sourceHostName, sourcePeerId: args.sourcePeerId
    });
  } finally {
    await deleteCompanionDownloadedSyncPack(packPath);
  }
}
