import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceRuntimeRepository';

export async function loadCompanionMissingContentBlobHashes(limit = 50) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [] as string[];
  }
  return (await FolioleCompanionSync.loadMissingContentBlobHashes({ limit })).hashes;
}

export interface CompanionMissingContentBlobBatch {
  blobs: Array<{ hash: string; size_bytes?: number }>;
  failedBytes: number | null;
  failedCount: number | null;
  hashes: string[];
  total: number | null;
  totalBytes: number | null;
}

function normalizeNumber(value: unknown) {
  return typeof value === 'number' ? value : null;
}

export async function loadCompanionMissingContentBlobBatch(limit = 50): Promise<CompanionMissingContentBlobBatch> {
  if (!isNativeAndroidCompanionRuntime()) {
    return { blobs: [], failedBytes: null, failedCount: null, hashes: [], total: null, totalBytes: null };
  }
  const result = await FolioleCompanionSync.loadMissingContentBlobHashes({ limit });
  const blobs = Array.isArray(result.blobs)
    ? result.blobs
    : result.hashes.map((hash) => ({ hash }));
  return {
    blobs,
    failedBytes: normalizeNumber(result.failed_content_blob_bytes),
    failedCount: normalizeNumber(result.failed_content_blob_count),
    hashes: result.hashes,
    total: normalizeNumber(result.missing_content_blob_count),
    totalBytes: normalizeNumber(result.missing_content_blob_bytes)
  };
}

export async function loadCompanionMissingContentBlobs(limit = 50): Promise<Array<{ hash: string; size_bytes?: number }>> {
  return (await loadCompanionMissingContentBlobBatch(limit)).blobs;
}

export async function syncCompanionContentBlob(args: {
  hash: string;
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    return { availability: 'missing', hash: args.hash };
  }
  return runCompanionSyncWriterTask(() => FolioleCompanionSync.syncContentBlob(args));
}

export async function syncCompanionContentBlobs(args: {
  body: string;
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeAndroidCompanionRuntime()) {
    throw new Error('Native content body batch sync is unavailable.');
  }
  return runCompanionSyncWriterTask(() => FolioleCompanionSync.syncContentBlobs(args));
}
