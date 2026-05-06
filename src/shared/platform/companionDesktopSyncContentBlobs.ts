import { postDesktopJson } from './companionDesktopSyncHttp';
import type {
  CompanionContentBlobNativeTiming,
  CompanionDesktopSyncProgress
} from './companionDesktopSyncTypes';
import { loadLocalSyncDiagnostics } from './companionSyncDiagnostics';
import {
  loadCompanionMissingContentBlobs,
  syncCompanionContentBlob,
  syncCompanionContentBlobs
} from './companionSyncObjects';
import { createSignedRequestHeaders } from './companionWorkspacePairing';

const CONTENT_BLOB_RESOURCE_PATH = '/companion/content-blob';
const CONTENT_BLOB_BATCH_PATH = '/companion/content-blobs';
const CONTENT_BLOB_ACK_PATH = '/companion/content-blob/ack';
export const CONTENT_BLOB_BATCH_LIMIT = 256;
export const CONTENT_BLOB_MAX_BATCHES_PER_SYNC = 20;
export const CONTENT_BLOB_CONCURRENT_FETCH_LIMIT = 6;
export const COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS = 60_000;
export const COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS = 45_000;

type ProgressHandler = (progress: CompanionDesktopSyncProgress) => void;
type MissingContentBlob = { hash: string; size_bytes?: number };
type ContentBlobBatchResult = {
  failedContentBlobCount: number;
  nativeTiming?: CompanionContentBlobNativeTiming;
  syncedContentBlobHashes: string[];
};

function knownNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value : undefined;
}

async function ackContentBlobs(endpointUrl: string, hashes: string[]) {
  if (hashes.length === 0) return;
  await postDesktopJson(endpointUrl, CONTENT_BLOB_ACK_PATH, { hashes }).catch(() => undefined);
}

function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
}

function sumNativeTiming(
  current: CompanionContentBlobNativeTiming | undefined,
  next: CompanionContentBlobNativeTiming | undefined
) {
  if (!next) return current;
  if (!current) return next;
  return {
    dbElapsedMs: current.dbElapsedMs + next.dbElapsedMs,
    httpElapsedMs: current.httpElapsedMs + next.httpElapsedMs,
    parseElapsedMs: current.parseElapsedMs + next.parseElapsedMs,
    totalElapsedMs: current.totalElapsedMs + next.totalElapsedMs
  };
}

function buildContentBlobPath(hash: string) {
  const params = new URLSearchParams();
  params.set('hash', hash);
  return `${CONTENT_BLOB_RESOURCE_PATH}?${params.toString()}`;
}

async function loadMissingContentBlobSummary() {
  const diagnostics = await loadLocalSyncDiagnostics().catch(() => null);
  return {
    contentBreakdown: diagnostics ? {
      activeTopicBodies: diagnostics.content.missing_active_topic_body_count,
      dueReviewBodies: diagnostics.content.missing_due_review_body_count,
      externalDocumentBodies: diagnostics.content.missing_external_document_body_count,
      nestedTopicBodies: diagnostics.content.missing_nested_topic_body_count,
      topLevelTopicBodies: diagnostics.content.missing_top_level_topic_body_count,
      topicBodies: diagnostics.content.missing_topic_body_count
    } : undefined,
    failed: diagnostics?.content.failed_content_blob_count ?? null,
    failedBytes: diagnostics?.content.failed_content_blob_bytes ?? null,
    total: diagnostics?.content.missing_content_blob_count ?? null,
    totalBytes: diagnostics?.content.missing_content_blob_bytes ?? null
  };
}

export async function pullMissingContentBlobs(endpointUrl: string, onProgress?: ProgressHandler) {
  const startedAt = Date.now();
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedContentBlobHashes: string[] = [];
  const { contentBreakdown, failed, failedBytes, total, totalBytes } = await loadMissingContentBlobSummary();
  let contentBacklogRemaining = true;
  let nativeTiming: CompanionContentBlobNativeTiming | undefined;
  let syncedBytes = 0;
  let nextBlobsPromise: Promise<MissingContentBlob[]> | null = loadCompanionMissingContentBlobs(CONTENT_BLOB_BATCH_LIMIT);
  onProgress?.({ completed: 0, completedBytes: 0, contentBreakdown, elapsedMs: 0, failedBytes: knownNumber(failedBytes), failedCount: knownNumber(failed), phase: 'content', total, totalBytes });
  for (let batchIndex = 0; batchIndex < CONTENT_BLOB_MAX_BATCHES_PER_SYNC; batchIndex += 1) {
    if (batchIndex > 0 && Date.now() - startedAt >= COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS) break;
    const blobs = await (nextBlobsPromise ?? loadCompanionMissingContentBlobs(CONTENT_BLOB_BATCH_LIMIT));
    nextBlobsPromise = null;
    if (blobs.length === 0) {
      contentBacklogRemaining = false;
      break;
    }
    const hashes = blobs.map((blob) => blob.hash);
    const sizeByHash = new Map(blobs.map((blob) => [blob.hash, Math.max(0, blob.size_bytes ?? 0)]));
    const batchPromise = pullContentBlobBatch(endpoint, hashes, (syncedChunkHashes) => {
      syncedContentBlobHashes.push(...syncedChunkHashes);
      syncedBytes += syncedChunkHashes.reduce((sum, hash) => sum + (sizeByHash.get(hash) ?? 0), 0);
      onProgress?.({ completed: syncedContentBlobHashes.length, completedBytes: syncedBytes, contentBreakdown, elapsedMs: Date.now() - startedAt, failedBytes: knownNumber(failedBytes), failedCount: knownNumber(failed), phase: 'content', total, totalBytes });
    });
    if (hashes.length >= CONTENT_BLOB_BATCH_LIMIT) nextBlobsPromise = loadNextMissingContentBlobs(hashes);
    const batch = await batchPromise;
    nativeTiming = sumNativeTiming(nativeTiming, batch.nativeTiming);
    const syncedBatchHashes = batch.syncedContentBlobHashes;
    await ackContentBlobs(endpoint, syncedBatchHashes);
    if (syncedBatchHashes.length === 0 && batch.failedContentBlobCount > 0) {
      if (syncedContentBlobHashes.length > 0) break;
      throw new Error('Topic body batch could not download any requested body.');
    }
    if (hashes.length < CONTENT_BLOB_BATCH_LIMIT || syncedBatchHashes.length === 0) {
      contentBacklogRemaining = syncedBatchHashes.length === 0 || batch.failedContentBlobCount > 0;
      break;
    }
  }
  return { contentBacklogRemaining, syncedContentBlobBytes: syncedBytes, syncedContentBlobHashes, syncedContentBlobNativeTiming: nativeTiming };
}

async function loadNextMissingContentBlobs(inFlightHashes: string[]) {
  const inFlightHashSet = new Set(inFlightHashes);
  const candidates = await loadCompanionMissingContentBlobs(CONTENT_BLOB_BATCH_LIMIT * 2);
  return candidates
    .filter((blob) => !inFlightHashSet.has(blob.hash))
    .slice(0, CONTENT_BLOB_BATCH_LIMIT);
}

async function pullContentBlobBatch(
  endpoint: string,
  hashes: string[],
  onSyncedChunk?: (hashes: string[]) => void
): Promise<ContentBlobBatchResult> {
  try {
    const batch = await pullContentBlobNativeBatch(endpoint, hashes);
    const syncedContentBlobHashes = batch.syncedContentBlobHashes;
    if (syncedContentBlobHashes.length > 0) onSyncedChunk?.(syncedContentBlobHashes);
    return {
      failedContentBlobCount: hashes.length - syncedContentBlobHashes.length,
      nativeTiming: batch.nativeTiming,
      syncedContentBlobHashes
    };
  } catch {
    const syncedContentBlobHashes: string[] = [];
    let failedContentBlobCount = 0;
    for (let index = 0; index < hashes.length; index += CONTENT_BLOB_CONCURRENT_FETCH_LIMIT) {
      const chunk = hashes.slice(index, index + CONTENT_BLOB_CONCURRENT_FETCH_LIMIT);
      const syncedChunkHashes = await Promise.all(chunk.map(async (hash) => {
        try {
          return await pullContentBlob(endpoint, hash);
        } catch {
          failedContentBlobCount += 1;
          return null;
        }
      }));
      const syncedHashes = syncedChunkHashes.filter((hash): hash is string => Boolean(hash));
      syncedContentBlobHashes.push(...syncedHashes);
      if (syncedHashes.length > 0) onSyncedChunk?.(syncedHashes);
    }
    return { failedContentBlobCount, syncedContentBlobHashes };
  }
}

async function pullContentBlobNativeBatch(endpoint: string, hashes: string[]) {
  const pathWithQuery = CONTENT_BLOB_BATCH_PATH;
  const body = JSON.stringify({ hashes });
  const result = await syncCompanionContentBlobs({
    body,
    headers: await createSignedRequestHeaders({ bodyText: body, method: 'POST', pathWithQuery }),
    url: `${endpoint}${pathWithQuery}`
  });
  return {
    nativeTiming: normalizeNativeTiming(result),
    syncedContentBlobHashes: result.synced_hashes
  };
}

function normalizeNativeTiming(result: Awaited<ReturnType<typeof syncCompanionContentBlobs>>) {
  const httpElapsedMs = knownNumber(result.http_elapsed_ms) ?? 0;
  const parseElapsedMs = knownNumber(result.parse_elapsed_ms) ?? 0;
  const dbElapsedMs = knownNumber(result.db_elapsed_ms) ?? 0;
  const totalElapsedMs = knownNumber(result.total_elapsed_ms) ?? httpElapsedMs + parseElapsedMs + dbElapsedMs;
  if (httpElapsedMs <= 0 && parseElapsedMs <= 0 && dbElapsedMs <= 0 && totalElapsedMs <= 0) return undefined;
  return { dbElapsedMs, httpElapsedMs, parseElapsedMs, totalElapsedMs };
}

async function pullContentBlob(endpoint: string, hash: string) {
  const pathWithQuery = buildContentBlobPath(hash);
  const result = await syncCompanionContentBlob({
    hash,
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
    url: `${endpoint}${pathWithQuery}`
  });
  return result.availability === 'cached' ? result.hash : null;
}

export async function syncCompanionContentBlobFromDesktop(endpointUrl: string, hash: string) {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedHash = await pullContentBlob(endpoint, hash);
  if (syncedHash) {
    await ackContentBlobs(endpoint, [syncedHash]);
  }
  return { availability: syncedHash ? 'cached' as const : 'missing' as const, hash };
}
