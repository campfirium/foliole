import { pushLocalDirtyObjects } from './companionDesktopSyncPush';
import {
  createEmptyResourceStages,
  createSkippedResourceSummary,
  pullResourceStages
} from './companionDesktopSyncResourceStages';
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
export const COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS = 45_000;
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

function pushErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Desktop sync push failed.';
}

function mergeCompanionObjectsSyncResult(args: {
  finalSummary: Awaited<ReturnType<typeof loadCompanionDesktopSyncSummary>> | ReturnType<typeof createSkippedResourceSummary>;
  pack: Awaited<ReturnType<typeof pullRemoteStructurePack>>;
  pushed: Awaited<ReturnType<typeof pushLocalDirtyObjects>> | {
    pushConflictCount: number;
    pushedObjectIds: string[];
    pushedReviewOpIds: string[];
    pushError: string;
    pushRejectedCount: number;
  };
  resources: ReturnType<typeof createEmptyResourceStages> | Awaited<ReturnType<typeof pullResourceStages>>;
}): CompanionDesktopSyncResult {
  return {
    appliedNodeIds: [],
    appliedPackBlobCount: args.pack.appliedPackBlobCount,
    appliedPackObjectCount: args.pack.appliedPackObjectCount,
    appliedObjectIds: [],
    appliedReviewOpIds: args.pack.appliedReviewOpIds,
    changedObjectIds: [],
    pushedNodeIds: [],
    pushedObjectIds: args.pushed.pushedObjectIds,
    pushedReviewOpIds: args.pushed.pushedReviewOpIds,
    requestedObjectIds: [],
    ...args.resources,
    ...args.finalSummary,
    pushConflictCount: args.pushed.pushConflictCount,
    pushError: args.pushed.pushError,
    pushRejectedCount: args.pushed.pushRejectedCount
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
  const pack = await withSyncStepTimeout('applying the structure pack', pullRemoteStructurePack(endpointUrl), COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS);
  options.onProgress?.({ completed: pack.appliedPackObjectCount, phase: 'structure', total: pack.appliedPackObjectCount });
  await options.onStructureSynced?.();
  const resources = options.includeResources === false
    ? createEmptyResourceStages()
    : await pullResourceStages(endpointUrl, options.onProgress);
  const finalSummary = options.includeResources === false
    ? createSkippedResourceSummary()
    : await loadCompanionDesktopSyncSummary(endpointUrl);
  return mergeCompanionObjectsSyncResult({ finalSummary, pack, pushed, resources });
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
