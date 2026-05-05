import { pushLocalDirtyObjects } from './companionDesktopSyncPush';
import {
  COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS,
  pullMissingAttachmentResources,
  pullMissingContentBlobs
} from './companionDesktopSyncResources';
import type {
  CompanionDesktopSyncOptions,
  CompanionDesktopSyncResult
} from './companionDesktopSyncTypes';
import {
  loadDesktopSyncDiagnostics,
  loadLocalSyncDiagnostics
} from './companionSyncDiagnostics';
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
    appliedReviewOpIds
  };
}

async function loadFinalSyncSummary(endpointUrl: string) {
  const diagnostics = await loadLocalSyncDiagnostics().catch(() => null);
  const desktopDiagnostics = await loadDesktopSyncDiagnostics(endpointUrl).catch(() => null);
  const desktopStateSeq = desktopDiagnostics?.sync_state.max_state_seq;
  const androidCursor = diagnostics?.sync_state.pack_cursor;
  return {
    localDirtyCount: diagnostics?.sync_state.local_dirty_count ?? null,
    pendingAckCount: diagnostics?.sync_state.pending_ack_count ?? null,
    pushIssueCount: diagnostics?.sync_state.push_issue_count ?? null,
    remainingAttachmentResourceBytes: diagnostics?.content.missing_attachment_resource_bytes ?? null,
    remainingAttachmentResourceCount: diagnostics?.content.missing_attachment_resource_count ?? null,
    remainingContentBlobBytes: diagnostics?.content.missing_content_blob_bytes ?? null,
    remainingContentBlobCount: diagnostics?.content.missing_content_blob_count ?? null,
    remainingStructureChangeCount: typeof desktopStateSeq === 'number' && typeof androidCursor === 'number'
      ? Math.max(0, desktopStateSeq - androidCursor)
      : null
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
  let attachmentResourceError: string | null = null;
  let contentBlobError: string | null = null;
  let syncedAttachmentIds: string[] = [];
  let syncedContentBlobHashes: string[] = [];
  try {
    const blobs = await withSyncStepTimeout(
      'fetching topic bodies',
      pullMissingContentBlobs(endpointUrl, onProgress),
      COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS
    );
    syncedContentBlobHashes = blobs.syncedContentBlobHashes;
  } catch (error) {
    contentBlobError = errorMessage(error);
  }
  try {
    const attachments = await withSyncStepTimeout(
      'fetching attachment resources',
      pullMissingAttachmentResources(endpointUrl, onProgress),
      COMPANION_DESKTOP_SYNC_RESOURCE_TIMEOUT_MS
    );
    syncedAttachmentIds = attachments.syncedAttachmentIds;
  } catch (error) {
    attachmentResourceError = errorMessage(error);
  }
  return { attachmentResourceError, contentBlobError, syncedAttachmentIds, syncedContentBlobHashes };
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
  const finalSummary = await loadFinalSyncSummary(endpointUrl);
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
    attachmentResourceError: resources.attachmentResourceError,
    contentBlobError: resources.contentBlobError,
    localDirtyCount: finalSummary.localDirtyCount,
    pendingAckCount: finalSummary.pendingAckCount,
    pushConflictCount: pushed.pushConflictCount,
    pushIssueCount: finalSummary.pushIssueCount,
    remainingAttachmentResourceBytes: finalSummary.remainingAttachmentResourceBytes,
    remainingAttachmentResourceCount: finalSummary.remainingAttachmentResourceCount,
    remainingContentBlobBytes: finalSummary.remainingContentBlobBytes,
    remainingContentBlobCount: finalSummary.remainingContentBlobCount,
    remainingStructureChangeCount: finalSummary.remainingStructureChangeCount,
    syncedContentBlobHashes: resources.syncedContentBlobHashes,
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
