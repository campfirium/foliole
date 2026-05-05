import { postDesktopJson } from './companionDesktopSyncHttp';
import { syncCompanionAttachmentResourceRequestsFromDesktop } from './companionDesktopAttachmentResources';
import { pushLocalDirtyObjects } from './companionDesktopSyncPush';
import { loadLocalSyncDiagnostics } from './companionSyncDiagnostics';
import {
  applyCompanionDesktopSyncPack,
  loadCompanionMissingAttachmentResources,
  loadCompanionMissingContentBlobs,
  loadCompanionSyncPackCursor,
  saveCompanionSyncPackCursor,
  syncCompanionContentBlob
} from './companionSyncObjects';
import { createSignedRequestHeaders } from './companionWorkspacePairing';

const CONTENT_BLOB_RESOURCE_PATH = '/companion/content-blob';
const CONTENT_BLOB_ACK_PATH = '/companion/content-blob/ack';
const SYNC_PACK_PATH = '/companion/sync-pack';
export const CONTENT_BLOB_BATCH_LIMIT = 64;
export const CONTENT_BLOB_MAX_BATCHES_PER_SYNC = 20;
export const CONTENT_BLOB_CONCURRENT_FETCH_LIMIT = 6;
export const ATTACHMENT_RESOURCE_BATCH_LIMIT = 64;
export const ATTACHMENT_RESOURCE_MAX_BATCHES_PER_SYNC = 20;
export const COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS = 60_000;
export const COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS = 5 * 60_000;

export interface CompanionDesktopSyncOptions {
  onProgress?: (progress: CompanionDesktopSyncProgress) => void;
  onStructureSynced?: () => Promise<void> | void;
}

export interface CompanionDesktopSyncProgress {
  completed: number;
  completedBytes?: number;
  phase: 'attachment' | 'content' | 'structure';
  total: number | null;
  totalBytes?: number | null;
}

export interface CompanionDesktopSyncResult {
  appliedNodeIds: string[];
  appliedPackBlobCount: number;
  appliedPackObjectCount: number;
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
  changedObjectIds: string[];
  pushedNodeIds: string[];
  pushedObjectIds: string[];
  pushedReviewOpIds: string[];
  requestedObjectIds: string[];
  syncedAttachmentIds: string[];
  attachmentResourceError: string | null;
  contentBlobError: string | null;
  localDirtyCount: number | null;
  pendingAckCount: number | null;
  remainingAttachmentResourceBytes: number | null;
  remainingAttachmentResourceCount: number | null;
  remainingContentBlobBytes: number | null;
  remainingContentBlobCount: number | null;
  syncedContentBlobHashes: string[];
}

const inFlightSyncByEndpoint = new Map<string, Promise<CompanionDesktopSyncResult>>();

function buildPackPath(cursor: number | null) {
  const params = new URLSearchParams();
  params.set('after_state_seq', String(cursor ?? 0));
  return `${SYNC_PACK_PATH}?${params.toString()}`;
}

function buildContentBlobPath(hash: string) {
  const params = new URLSearchParams();
  params.set('hash', hash);
  return `${CONTENT_BLOB_RESOURCE_PATH}?${params.toString()}`;
}

async function ackContentBlob(endpointUrl: string, hash: string) {
  await postDesktopJson(endpointUrl, CONTENT_BLOB_ACK_PATH, { hashes: [hash] });
}

function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
}

async function pullRemoteStructurePack(endpointUrl: string) {
  const cursor = await loadCompanionSyncPackCursor();
  const pathWithQuery = buildPackPath(cursor);
  const result = await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
    url: `${normalizeEndpointUrl(endpointUrl)}${pathWithQuery}`
  });
  if (result.to_state_seq > (cursor ?? 0)) {
    await saveCompanionSyncPackCursor(result.to_state_seq);
  }
  return {
    appliedPackBlobCount: result.applied_blob_count,
    appliedPackObjectCount: result.applied_object_count
  };
}

async function loadMissingContentBlobSummary() {
  const diagnostics = await loadLocalSyncDiagnostics().catch(() => null);
  return {
    total: diagnostics?.content.missing_content_blob_count ?? null,
    totalBytes: diagnostics?.content.missing_content_blob_bytes ?? null
  };
}

async function loadMissingAttachmentResourceSummary() {
  const diagnostics = await loadLocalSyncDiagnostics().catch(() => null);
  return {
    total: diagnostics?.content.missing_attachment_resource_count ?? null,
    totalBytes: diagnostics?.content.missing_attachment_resource_bytes ?? null
  };
}

async function loadFinalLocalSyncSummary() {
  const diagnostics = await loadLocalSyncDiagnostics().catch(() => null);
  return {
    localDirtyCount: diagnostics?.sync_state.local_dirty_count ?? null,
    pendingAckCount: diagnostics?.sync_state.pending_ack_count ?? null,
    remainingAttachmentResourceBytes: diagnostics?.content.missing_attachment_resource_bytes ?? null,
    remainingAttachmentResourceCount: diagnostics?.content.missing_attachment_resource_count ?? null,
    remainingContentBlobBytes: diagnostics?.content.missing_content_blob_bytes ?? null,
    remainingContentBlobCount: diagnostics?.content.missing_content_blob_count ?? null
  };
}

async function pullMissingContentBlobs(endpointUrl: string, onProgress?: CompanionDesktopSyncOptions['onProgress']) {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedContentBlobHashes: string[] = [];
  const { total, totalBytes } = await loadMissingContentBlobSummary();
  let syncedBytes = 0;
  onProgress?.({ completed: 0, completedBytes: 0, phase: 'content', total, totalBytes });
  for (let batchIndex = 0; batchIndex < CONTENT_BLOB_MAX_BATCHES_PER_SYNC; batchIndex += 1) {
    const blobs = await loadCompanionMissingContentBlobs(CONTENT_BLOB_BATCH_LIMIT);
    if (blobs.length === 0) {
      break;
    }
    const hashes = blobs.map((blob) => blob.hash);
    const syncedBatchHashes = await pullContentBlobBatch(endpoint, hashes);
    syncedContentBlobHashes.push(...syncedBatchHashes);
    const syncedHashSet = new Set(syncedBatchHashes);
    syncedBytes += blobs
      .filter((blob) => syncedHashSet.has(blob.hash))
      .reduce((sum, blob) => sum + Math.max(0, blob.size_bytes ?? 0), 0);
    onProgress?.({
      completed: syncedContentBlobHashes.length,
      completedBytes: syncedBytes,
      phase: 'content',
      total,
      totalBytes
    });
    if (hashes.length < CONTENT_BLOB_BATCH_LIMIT || syncedBatchHashes.length === 0) {
      break;
    }
  }
  return { syncedContentBlobHashes };
}

async function pullMissingAttachmentResources(endpointUrl: string, onProgress?: CompanionDesktopSyncOptions['onProgress']) {
  const { total, totalBytes } = await loadMissingAttachmentResourceSummary();
  const syncedAttachmentIds: string[] = [];
  let syncedBytes = 0;
  onProgress?.({ completed: 0, completedBytes: 0, phase: 'attachment', total, totalBytes });
  for (let batchIndex = 0; batchIndex < ATTACHMENT_RESOURCE_MAX_BATCHES_PER_SYNC; batchIndex += 1) {
    const resources = await loadCompanionMissingAttachmentResources(ATTACHMENT_RESOURCE_BATCH_LIMIT);
    if (resources.length === 0) {
      break;
    }
    const syncedBatchIds = await syncCompanionAttachmentResourceRequestsFromDesktop(
      endpointUrl,
      resources.map((resource) => ({
        attachmentId: resource.attachment_id,
        contentHash: resource.content_hash
      }))
    );
    syncedAttachmentIds.push(...syncedBatchIds);
    const syncedIdSet = new Set(syncedBatchIds);
    syncedBytes += resources
      .filter((resource) => syncedIdSet.has(resource.attachment_id))
      .reduce((sum, resource) => sum + Math.max(0, resource.size_bytes ?? 0), 0);
    onProgress?.({
      completed: syncedAttachmentIds.length,
      completedBytes: syncedBytes,
      phase: 'attachment',
      total,
      totalBytes
    });
    if (resources.length < ATTACHMENT_RESOURCE_BATCH_LIMIT || syncedBatchIds.length === 0) {
      break;
    }
  }
  return { syncedAttachmentIds };
}

async function pullContentBlobBatch(endpoint: string, hashes: string[]) {
  const syncedContentBlobHashes: string[] = [];
  for (let index = 0; index < hashes.length; index += CONTENT_BLOB_CONCURRENT_FETCH_LIMIT) {
    const chunk = hashes.slice(index, index + CONTENT_BLOB_CONCURRENT_FETCH_LIMIT);
    const syncedChunkHashes = await Promise.all(chunk.map((hash) => pullContentBlob(endpoint, hash)));
    syncedContentBlobHashes.push(...syncedChunkHashes.filter((hash): hash is string => Boolean(hash)));
  }
  return syncedContentBlobHashes;
}

async function pullContentBlob(endpoint: string, hash: string) {
  const pathWithQuery = buildContentBlobPath(hash);
  const result = await syncCompanionContentBlob({
    hash,
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
    url: `${endpoint}${pathWithQuery}`
  });
  if (result.availability !== 'cached') {
    return null;
  }
  await ackContentBlob(endpoint, result.hash);
  return result.hash;
}

export async function syncCompanionContentBlobFromDesktop(endpointUrl: string, hash: string) {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedHash = await pullContentBlob(endpoint, hash);
  const result = { availability: syncedHash ? 'cached' as const : 'missing' as const, hash };
  return result;
}

async function withSyncStepTimeout<T>(
  stage: string,
  work: Promise<T>,
  timeoutMs = COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Desktop sync timed out while ${stage}.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Desktop content blob sync failed.';
}

async function runCompanionObjectsSync(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions = {}
): Promise<CompanionDesktopSyncResult> {
  const pushed = await withSyncStepTimeout('pushing local review changes', pushLocalDirtyObjects(endpointUrl))
    .catch(() => ({ pushedObjectIds: [], pushedReviewOpIds: [] }));
  const pack = await withSyncStepTimeout('applying the structure pack', pullRemoteStructurePack(endpointUrl));
  options.onProgress?.({ completed: pack.appliedPackObjectCount, phase: 'structure', total: pack.appliedPackObjectCount });
  await options.onStructureSynced?.();
  let attachmentResourceError: string | null = null;
  let contentBlobError: string | null = null;
  let syncedAttachmentIds: string[] = [];
  let syncedContentBlobHashes: string[] = [];
  try {
    const attachments = await withSyncStepTimeout(
      'fetching attachment resources',
      pullMissingAttachmentResources(endpointUrl, options.onProgress),
      COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS
    );
    syncedAttachmentIds = attachments.syncedAttachmentIds;
  } catch (error) {
    attachmentResourceError = errorMessage(error);
  }
  try {
    const blobs = await withSyncStepTimeout(
      'fetching topic bodies',
      pullMissingContentBlobs(endpointUrl, options.onProgress),
      COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS
    );
    syncedContentBlobHashes = blobs.syncedContentBlobHashes;
  } catch (error) {
    contentBlobError = errorMessage(error);
  }
  const finalSummary = await loadFinalLocalSyncSummary();
  return {
    appliedNodeIds: [],
    appliedPackBlobCount: pack.appliedPackBlobCount,
    appliedPackObjectCount: pack.appliedPackObjectCount,
    appliedObjectIds: [],
    appliedReviewOpIds: [],
    changedObjectIds: [],
    pushedNodeIds: [],
    pushedObjectIds: pushed.pushedObjectIds,
    pushedReviewOpIds: pushed.pushedReviewOpIds,
    requestedObjectIds: [],
    syncedAttachmentIds,
    attachmentResourceError,
    contentBlobError,
    localDirtyCount: finalSummary.localDirtyCount,
    pendingAckCount: finalSummary.pendingAckCount,
    remainingAttachmentResourceBytes: finalSummary.remainingAttachmentResourceBytes,
    remainingAttachmentResourceCount: finalSummary.remainingAttachmentResourceCount,
    remainingContentBlobBytes: finalSummary.remainingContentBlobBytes,
    remainingContentBlobCount: finalSummary.remainingContentBlobCount,
    syncedContentBlobHashes
  };
}

export function syncCompanionObjectsFromDesktop(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions = {}
): Promise<CompanionDesktopSyncResult> {
  const cacheKey = endpointUrl.trim();
  const inFlightSync = inFlightSyncByEndpoint.get(cacheKey);
  if (inFlightSync) {
    return inFlightSync;
  }
  const nextSync = runCompanionObjectsSync(endpointUrl, options).finally(() => {
    if (inFlightSyncByEndpoint.get(cacheKey) === nextSync) {
      inFlightSyncByEndpoint.delete(cacheKey);
    }
  });
  inFlightSyncByEndpoint.set(cacheKey, nextSync);
  return nextSync;
}
