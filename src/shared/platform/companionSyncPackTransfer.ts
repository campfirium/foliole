import { registerPlugin } from '@capacitor/core';

import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';

interface CompanionSyncPackTransferPlugin {
  deleteDownloadedSyncPack(args: { pack_path: string }): Promise<{ deleted: boolean }>;
  downloadDesktopSyncPack(args: {
    body?: string;
    expected_peer_id: string;
    expected_source_peer_id: string;
    headers: Record<string, string>;
    method?: 'GET' | 'POST';
    url: string;
  }): Promise<{ pack_path: string; manifest?: unknown }>;
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

export async function downloadCompanionDesktopSyncIdentityPack(args: {
  body: string;
  expectedPeerId: string;
  expectedSourcePeerId: string;
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeSyncPackRuntime()) throw new Error('sync_identity_native_transfer_unavailable');
  const result = await FolioleCompanionSyncPackTransfer.downloadDesktopSyncPack({
    body: args.body,
    expected_peer_id: args.expectedPeerId,
    expected_source_peer_id: args.expectedSourcePeerId,
    headers: args.headers,
    method: 'POST',
    url: args.url
  });
  if (!result.pack_path || !result.manifest) {
    if (result.pack_path) await deleteCompanionDownloadedSyncPack(result.pack_path);
    throw new Error('sync_identity_native_manifest_missing');
  }
  return { packPath: result.pack_path, manifest: result.manifest };
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
