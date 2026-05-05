import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

export async function loadCompanionMissingContentBlobHashes(limit = 50) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as string[];
  }
  return (await FolioleCompanionSync.loadMissingContentBlobHashes({ limit })).hashes;
}

export async function loadCompanionMissingContentBlobs(limit = 50): Promise<Array<{ hash: string; size_bytes?: number }>> {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as Array<{ hash: string; size_bytes?: number }>;
  }
  const result = await FolioleCompanionSync.loadMissingContentBlobHashes({ limit });
  if (Array.isArray(result.blobs)) {
    return result.blobs;
  }
  return result.hashes.map((hash) => ({ hash }));
}

export async function syncCompanionContentBlob(args: {
  hash: string;
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return { availability: 'missing', hash: args.hash };
  }
  return FolioleCompanionSync.syncContentBlob(args);
}

export async function syncCompanionContentBlobs(args: {
  body: string;
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    throw new Error('Native content body batch sync is unavailable.');
  }
  return FolioleCompanionSync.syncContentBlobs(args);
}
