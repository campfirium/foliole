import { pushLocalDirtyObjects } from './companionDesktopSyncPush';
import {
  COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS,
  pullMissingAttachmentResources,
  pullMissingContentBlobs
} from './companionDesktopSyncResources';
import { loadCompanionDesktopSyncSummary } from './companionDesktopSyncSummary';
import type {
  CompanionDesktopSyncOptions,
  CompanionDesktopSyncResult
} from './companionDesktopSyncTypes';
import {
  applyCompanionDesktopSyncPack,
  loadCompanionSyncPackCursor,
  loadCompanionSyncReviewLog,
  loadCompanionSyncReviewLogPushCursor,
  saveCompanionSyncPackCursor,
  saveCompanionSyncReviewLogPushCursor
} from './companionSyncObjects';
import { createSignedRequestHeaders } from './companionWorkspacePairing';

const SYNC_PACK_PATH = '/companion/sync-pack';
export const COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS = 60_000;
export {
  ATTACHMENT_RESOURCE_BATCH_LIMIT,
  CONTENT_BLOB_BATCH_LIMIT,
  syncCompanionContentBlobFromDesktop
} from './companionDesktopSyncResources';
export type {
  CompanionDesktopSyncOptions,
  CompanionDesktopSyncProgress,
  CompanionDesktopSyncResult
} from './companionDesktopSyncTypes';
const inFlightSyncByEndpoint = new Map<string, Promise<CompanionDesktopSyncResult>>();

function buildPackPath(cursor: number | null) {
  const params = new URLSearchParams();
  params.set('after_state_seq', String(cursor ?? 0));
  return `${SYNC_PACK_PATH}?${params.toString()}`;
}

function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
}

async function saveConfirmedReviewLogPushCursor(confirmedOpIds: string[]) {
  if (confirmedOpIds.length === 0) {
    return;
  }
  const confirmedSet = new Set(confirmedOpIds);
  const cursor = await loadCompanionSyncReviewLogPushCursor();
  const reviewLog = await loadCompanionSyncReviewLog(cursor, 100);
  let confirmed = null as null | { change_id: string; created_at: string };
  for (const row of reviewLog) {
    if (!confirmedSet.has(row.op_id)) {
      break;
    }
    confirmed = { change_id: row.op_id, created_at: row.reviewed_at };
  }
  if (confirmed) {
    await saveCompanionSyncReviewLogPushCursor(confirmed);
  }
}

async function pullRemoteStructurePack(endpointUrl: string) {
  const startedAt = Date.now();
  const cursor = await loadCompanionSyncPackCursor();
  const pathWithQuery = buildPackPath(cursor);
  const result = await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
    url: `${normalizeEndpointUrl(endpointUrl)}${pathWithQuery}`
  });
  if (result.to_state_seq > (cursor ?? 0)) {
    await saveCompanionSyncPackCursor(result.to_state_seq);
  }
  const appliedReviewOpIds = result.applied_review_op_ids ?? [];
  await saveConfirmedReviewLogPushCursor(appliedReviewOpIds);
  return {
    appliedPackBlobCount: result.applied_blob_count,
    appliedPackObjectCount: result.applied_object_count,
    appliedReviewOpIds,
    syncedStructureElapsedMs: Date.now() - startedAt
  };
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

function pushErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Desktop sync push failed.';
}

async function pullResourceStages(endpointUrl: string, onProgress?: CompanionDesktopSyncOptions['onProgress']) {
  const startedAt = Date.now();
  const contentPull = (async () => {
    const contentStartedAt = Date.now();
    const blobs = await withSyncStepTimeout(
      'fetching topic bodies',
      pullMissingContentBlobs(endpointUrl, onProgress),
      COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS
    );
    return { ...blobs, syncedContentBlobElapsedMs: Date.now() - contentStartedAt };
  })();
  const attachmentPull = (async () => {
    const attachmentStartedAt = Date.now();
    const attachments = await withSyncStepTimeout(
      'fetching attachment resources',
      pullMissingAttachmentResources(endpointUrl, onProgress),
      COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS
    );
    return { ...attachments, syncedAttachmentResourceElapsedMs: Date.now() - attachmentStartedAt };
  })();
  const [content, attachments] = await Promise.allSettled([contentPull, attachmentPull]);
  const contentValue = content.status === 'fulfilled' ? content.value : null;
  const attachmentValue = attachments.status === 'fulfilled' ? attachments.value : null;
  return {
    attachmentResourceError: attachments.status === 'rejected' ? errorMessage(attachments.reason) : null,
    contentBlobError: content.status === 'rejected' ? errorMessage(content.reason) : null,
    syncedAttachmentResourceElapsedMs: attachmentValue?.syncedAttachmentResourceElapsedMs ?? 0,
    syncedAttachmentIds: attachmentValue?.syncedAttachmentIds ?? [],
    syncedAttachmentResourceBytes: attachmentValue?.syncedAttachmentResourceBytes ?? 0,
    syncedContentBlobElapsedMs: contentValue?.syncedContentBlobElapsedMs ?? 0,
    syncedContentBlobBytes: contentValue?.syncedContentBlobBytes ?? 0,
    syncedContentBlobHashes: contentValue?.syncedContentBlobHashes ?? [],
    syncedResourceElapsedMs: Date.now() - startedAt
  };
}

async function runCompanionObjectsSync(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions = {}
): Promise<CompanionDesktopSyncResult> {
  const pushed = await withSyncStepTimeout('pushing local review changes', pushLocalDirtyObjects(endpointUrl))
    .catch((error) => ({
      pushConflictCount: 0,
      pushedObjectIds: [],
      pushedReviewOpIds: [],
      pushError: pushErrorMessage(error),
      pushRejectedCount: 0
    }));
  const pack = await withSyncStepTimeout('applying the structure pack', pullRemoteStructurePack(endpointUrl));
  options.onProgress?.({ completed: pack.appliedPackObjectCount, phase: 'structure', total: pack.appliedPackObjectCount });
  await options.onStructureSynced?.();
  const resources = await pullResourceStages(endpointUrl, options.onProgress);
  const finalSummary = await loadCompanionDesktopSyncSummary(endpointUrl);
  return {
    appliedNodeIds: [],
    appliedPackBlobCount: pack.appliedPackBlobCount,
    appliedPackObjectCount: pack.appliedPackObjectCount,
    appliedObjectIds: [],
    appliedReviewOpIds: pack.appliedReviewOpIds,
    changedObjectIds: [],
    pushedNodeIds: [],
    pushedObjectIds: pushed.pushedObjectIds,
    pushedReviewOpIds: pushed.pushedReviewOpIds,
    pushError: pushed.pushError,
    requestedObjectIds: [],
    syncedAttachmentIds: resources.syncedAttachmentIds,
    syncedAttachmentResourceElapsedMs: resources.syncedAttachmentResourceElapsedMs,
    syncedAttachmentResourceBytes: resources.syncedAttachmentResourceBytes,
    syncedResourceElapsedMs: resources.syncedResourceElapsedMs,
    syncedStructureElapsedMs: pack.syncedStructureElapsedMs,
    attachmentResourceError: resources.attachmentResourceError,
    contentBlobError: resources.contentBlobError,
    localDirtyCount: finalSummary.localDirtyCount,
    pendingAckCount: finalSummary.pendingAckCount,
    pushConflictCount: pushed.pushConflictCount,
    pushIssueCount: finalSummary.pushIssueCount,
    remainingAttachmentBreakdown: finalSummary.remainingAttachmentBreakdown,
    remainingAttachmentResourceBytes: finalSummary.remainingAttachmentResourceBytes,
    remainingAttachmentResourceCount: finalSummary.remainingAttachmentResourceCount,
    remainingFailedAttachmentResourceBytes: finalSummary.remainingFailedAttachmentResourceBytes,
    remainingFailedAttachmentResourceCount: finalSummary.remainingFailedAttachmentResourceCount,
    remainingContentBreakdown: finalSummary.remainingContentBreakdown,
    remainingContentBlobBytes: finalSummary.remainingContentBlobBytes,
    remainingContentBlobCount: finalSummary.remainingContentBlobCount,
    remainingFailedContentBlobBytes: finalSummary.remainingFailedContentBlobBytes,
    remainingFailedContentBlobCount: finalSummary.remainingFailedContentBlobCount,
    remainingStructureChangeCount: finalSummary.remainingStructureChangeCount,
    syncedContentBlobHashes: resources.syncedContentBlobHashes,
    syncedContentBlobElapsedMs: resources.syncedContentBlobElapsedMs,
    syncedContentBlobBytes: resources.syncedContentBlobBytes,
    pushRejectedCount: pushed.pushRejectedCount
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
