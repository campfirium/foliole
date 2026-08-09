import { registerPlugin } from '@capacitor/core';

import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';

interface CompanionSyncPackTransferPlugin {
  deleteDownloadedSyncPack(args: { pack_path: string }): Promise<{ deleted: boolean }>;
  downloadDesktopSyncPack(args: {
    expected_peer_id: string;
    expected_source_peer_id: string;
    headers: Record<string, string>;
    url: string;
  }): Promise<{ pack_path: string }>;
}

const FolioleCompanionSyncPackTransfer = registerPlugin<CompanionSyncPackTransferPlugin>(
  'FolioleCompanionSyncPackTransfer'
);

export async function downloadCompanionDesktopSyncPack(args: {
  expectedPeerId: string;
  expectedSourcePeerId: string;
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeSyncPackRuntime()) {
    return null;
  }
  const result = await FolioleCompanionSyncPackTransfer.downloadDesktopSyncPack({
    expected_peer_id: args.expectedPeerId,
    expected_source_peer_id: args.expectedSourcePeerId,
    headers: args.headers,
    url: args.url
  });
  return result.pack_path;
}

export async function deleteCompanionDownloadedSyncPack(packPath: string) {
  if (!isNativeSyncPackRuntime()) {
    return false;
  }
  return (await FolioleCompanionSyncPackTransfer.deleteDownloadedSyncPack({ pack_path: packPath })).deleted;
}

function isNativeSyncPackRuntime() {
  const runtime = getCompanionRuntimeCapability();
  return runtime.kind === 'android-native' || runtime.kind === 'ios-native';
}
