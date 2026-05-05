import { syncCompanionAttachmentResourceRequestsFromDesktop } from './companionDesktopAttachmentResources';
import { postDesktopJson } from './companionDesktopSyncHttp';
import type { CompanionDesktopSyncProgress } from './companionDesktopSyncTypes';
import { loadLocalSyncDiagnostics } from './companionSyncDiagnostics';
import {
  loadCompanionMissingAttachmentResources,
  loadCompanionMissingContentBlobs,
  syncCompanionContentBlob
} from './companionSyncObjects';
import { createSignedRequestHeaders } from './companionWorkspacePairing';

const CONTENT_BLOB_RESOURCE_PATH = '/companion/content-blob';
const CONTENT_BLOB_ACK_PATH = '/companion/content-blob/ack';
export const CONTENT_BLOB_BATCH_LIMIT = 64;
export const CONTENT_BLOB_MAX_BATCHES_PER_SYNC = 20;
export const CONTENT_BLOB_CONCURRENT_FETCH_LIMIT = 6;
export const ATTACHMENT_RESOURCE_BATCH_LIMIT = 64;
export const ATTACHMENT_RESOURCE_MAX_BATCHES_PER_SYNC = 20;
export const COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS = 5 * 60_000;
export const COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS = 45_000;

type ProgressHandler = (progress: CompanionDesktopSyncProgress) => void;

async function ackContentBlobs(endpointUrl: string, hashes: string[]) {
  if (hashes.length === 0) return;
  await postDesktopJson(endpointUrl, CONTENT_BLOB_ACK_PATH, { hashes }).catch(() => undefined);
}

function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
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
    total: diagnostics?.content.missing_content_blob_count ?? null,
    totalBytes: diagnostics?.content.missing_content_blob_bytes ?? null
  };
}

async function loadMissingAttachmentResourceSummary() {
  const diagnostics = await loadLocalSyncDiagnostics().catch(() => null);
  return {
    attachmentBreakdown: diagnostics ? {
      activeTopicAttachments: diagnostics.content.missing_active_topic_attachment_resource_count,
      dueReviewAttachments: diagnostics.content.missing_due_review_attachment_resource_count,
      imageAttachments: diagnostics.content.missing_image_attachment_resource_count,
      imageBytes: diagnostics.content.missing_image_attachment_resource_bytes,
      otherAttachments: diagnostics.content.missing_other_attachment_resource_count,
      otherBytes: diagnostics.content.missing_other_attachment_resource_bytes,
      pdfAttachments: diagnostics.content.missing_pdf_attachment_resource_count,
      pdfBytes: diagnostics.content.missing_pdf_attachment_resource_bytes
    } : undefined,
    total: diagnostics?.content.missing_attachment_resource_count ?? null,
    totalBytes: diagnostics?.content.missing_attachment_resource_bytes ?? null
  };
}

export async function pullMissingContentBlobs(endpointUrl: string, onProgress?: ProgressHandler) {
  const startedAt = Date.now();
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedContentBlobHashes: string[] = [];
  const { contentBreakdown, total, totalBytes } = await loadMissingContentBlobSummary();
  let syncedBytes = 0;
  onProgress?.({ completed: 0, completedBytes: 0, contentBreakdown, elapsedMs: 0, phase: 'content', total, totalBytes });
  for (let batchIndex = 0; batchIndex < CONTENT_BLOB_MAX_BATCHES_PER_SYNC; batchIndex += 1) {
    if (batchIndex > 0 && Date.now() - startedAt >= COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS) {
      break;
    }
    const blobs = await loadCompanionMissingContentBlobs(CONTENT_BLOB_BATCH_LIMIT);
    if (blobs.length === 0) break;
    const hashes = blobs.map((blob) => blob.hash);
    const batch = await pullContentBlobBatch(endpoint, hashes);
    const syncedBatchHashes = batch.syncedContentBlobHashes;
    await ackContentBlobs(endpoint, syncedBatchHashes);
    syncedContentBlobHashes.push(...syncedBatchHashes);
    const syncedHashSet = new Set(syncedBatchHashes);
    syncedBytes += blobs
      .filter((blob) => syncedHashSet.has(blob.hash))
      .reduce((sum, blob) => sum + Math.max(0, blob.size_bytes ?? 0), 0);
    onProgress?.({ completed: syncedContentBlobHashes.length, completedBytes: syncedBytes, contentBreakdown, elapsedMs: Date.now() - startedAt, phase: 'content', total, totalBytes });
    if (syncedBatchHashes.length === 0 && batch.failedContentBlobCount > 0) {
      throw new Error('Topic body batch could not download any requested body.');
    }
    if (hashes.length < CONTENT_BLOB_BATCH_LIMIT || syncedBatchHashes.length === 0) break;
  }
  return { syncedContentBlobBytes: syncedBytes, syncedContentBlobHashes };
}

export async function pullMissingAttachmentResources(endpointUrl: string, onProgress?: ProgressHandler) {
  const startedAt = Date.now();
  const { attachmentBreakdown, total, totalBytes } = await loadMissingAttachmentResourceSummary();
  const syncedAttachmentIds: string[] = [];
  let syncedBytes = 0;
  onProgress?.({ attachmentBreakdown, completed: 0, completedBytes: 0, elapsedMs: 0, phase: 'attachment', total, totalBytes });
  for (let batchIndex = 0; batchIndex < ATTACHMENT_RESOURCE_MAX_BATCHES_PER_SYNC; batchIndex += 1) {
    if (batchIndex > 0 && Date.now() - startedAt >= COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS) {
      break;
    }
    const resources = await loadCompanionMissingAttachmentResources(ATTACHMENT_RESOURCE_BATCH_LIMIT);
    if (resources.length === 0) break;
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
    onProgress?.({ attachmentBreakdown, completed: syncedAttachmentIds.length, completedBytes: syncedBytes, elapsedMs: Date.now() - startedAt, phase: 'attachment', total, totalBytes });
    if (resources.length < ATTACHMENT_RESOURCE_BATCH_LIMIT || syncedBatchIds.length === 0) break;
  }
  return { syncedAttachmentResourceBytes: syncedBytes, syncedAttachmentIds };
}

async function pullContentBlobBatch(endpoint: string, hashes: string[]) {
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
    syncedContentBlobHashes.push(...syncedChunkHashes.filter((hash): hash is string => Boolean(hash)));
  }
  return { failedContentBlobCount, syncedContentBlobHashes };
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
  return result.hash;
}

export async function syncCompanionContentBlobFromDesktop(endpointUrl: string, hash: string) {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedHash = await pullContentBlob(endpoint, hash);
  if (syncedHash) {
    await ackContentBlobs(endpoint, [syncedHash]);
  }
  return { availability: syncedHash ? 'cached' as const : 'missing' as const, hash };
}
