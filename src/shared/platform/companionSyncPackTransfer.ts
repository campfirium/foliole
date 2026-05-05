import { registerPlugin } from '@capacitor/core';

import { isNativeAndroidCompanionRuntime } from './companionWorkspaceSyncBridge';

interface CompanionSyncPackTransferPlugin {
  deleteDownloadedSyncPack(args: { pack_path: string }): Promise<{ deleted: boolean }>;
  downloadDesktopSyncPack(args: {
    headers: Record<string, string>;
    url: string;
  }): Promise<{ pack_path: string }>;
}

const FolioleCompanionSyncPackTransfer = registerPlugin<CompanionSyncPackTransferPlugin>(
  'FolioleCompanionSyncPackTransfer'
);

export async function downloadCompanionDesktopSyncPack(args: {
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  const result = await FolioleCompanionSyncPackTransfer.downloadDesktopSyncPack(args);
  return result.pack_path;
}

export async function deleteCompanionDownloadedSyncPack(packPath: string) {
  if (!isNativeAndroidCompanionRuntime()) {
    return false;
  }
  return (await FolioleCompanionSyncPackTransfer.deleteDownloadedSyncPack({ pack_path: packPath })).deleted;
}
