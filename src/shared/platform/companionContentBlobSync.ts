import { commitStagedCompanionContentBatch } from './companion/runtime/companionBatchDataPlane';
import { loadIosMissingContentBlobs } from './companion/runtime/iosCompanionActiveDatabaseReads';
import { getIosCompanionDatabaseOwner } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import {
  FolioleCompanionSync,
  isNativeCompanionContentBlobRuntime
} from './companionWorkspaceRuntimeRepository';

export async function loadCompanionMissingContentBlobHashes(limit = 50) {
  if (!isNativeCompanionContentBlobRuntime()) {
    return [] as string[];
  }
  if (getCompanionRuntimeCapability().kind === 'ios-native') return (await loadIosMissingContentBlobs(limit)).hashes;
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
  if (!isNativeCompanionContentBlobRuntime()) {
    return { blobs: [], failedBytes: null, failedCount: null, hashes: [], total: null, totalBytes: null };
  }
  const result = getCompanionRuntimeCapability().kind === 'ios-native'
    ? await loadIosMissingContentBlobs(limit)
    : await FolioleCompanionSync.loadMissingContentBlobHashes({ limit });
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
  if (!isNativeCompanionContentBlobRuntime()) {
    return { availability: 'missing', hash: args.hash };
  }
  const result = await syncCompanionContentBlobs({
    body: JSON.stringify({ hashes: [args.hash] }),
    headers: args.headers,
    url: args.url
  });
  return {
    availability: result.synced_hashes.includes(args.hash) ? 'cached' : 'missing',
    hash: args.hash
  };
}

export async function syncCompanionContentBlobs(args: {
  body: string;
  headers: Record<string, string>;
  url: string;
}) {
  if (!isNativeCompanionContentBlobRuntime()) {
    throw new Error('Native content body batch sync is unavailable.');
  }
  const download = await FolioleCompanionSync.downloadContentBlobBatch(args);
  if (getCompanionRuntimeCapability().kind === 'ios-native') {
    const commit = await commitStagedCompanionContentBatch(
      getIosCompanionDatabaseOwner(), FolioleCompanionSync, download
    );
    return {
      db_elapsed_ms: 0,
      http_elapsed_ms: download.http_elapsed_ms,
      parse_elapsed_ms: download.parse_elapsed_ms,
      synced_hashes: commit.syncedHashes,
      total_elapsed_ms: download.total_elapsed_ms
    };
  }
  const commit = await runCompanionSyncWriterTask(() => FolioleCompanionSync.commitContentBlobBatch({
    batch_token: download.batch_token
  }));
  return {
    db_elapsed_ms: commit.db_elapsed_ms,
    http_elapsed_ms: download.http_elapsed_ms,
    parse_elapsed_ms: download.parse_elapsed_ms,
    synced_hashes: commit.synced_hashes,
    total_elapsed_ms: download.total_elapsed_ms
  };
}
