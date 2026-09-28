import { assertSyncPackCursorAdvance } from '../../../lib/core/sync/syncPackCursorGuard';
import { SYNC_PACK_PAGE_CONTRACT } from '../../../lib/core/sync/syncPackPageContract';

import { createSignedRequestHeaders } from './companion/network/signedRequest';
import {
  resolveCompanionSyncPeerHostName,
  resolveCompanionSyncPeerId
} from './companion/network/syncGroupPeerIdentity';
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
  loadCompanionSyncPackRestorePosition,
  saveCompanionSyncPackCursor
} from './companionSyncObjects';
import {
  companionSyncTimeoutOwnership,
  withSyncStepTimeout
} from './companionSyncTimeoutOwnership';

export const COMPANION_DESKTOP_SYNC_STRUCTURE_TIMEOUT_MS =
  companionSyncTimeoutOwnership('structure_pack_apply').timeoutMs;
export { ATTACHMENT_RESOURCE_BATCH_LIMIT, CONTENT_BLOB_BATCH_LIMIT, syncCompanionContentBlobFromDesktop } from './companionDesktopSyncResources';
export type { CompanionDesktopSyncOptions, CompanionDesktopSyncProgress, CompanionDesktopSyncResult } from './companionDesktopSyncTypes';
const inFlightSyncByEndpoint = new Map<string, Promise<CompanionDesktopSyncResult>>();

function buildPackPath(position: { cursor: number | null; frontierStateSeq?: number; sourceEpoch?: string },
  restoreId?: string) {
  const params = new URLSearchParams();
  params.set('after_state_seq', String(position.cursor ?? 0));
  params.set('page_contract', SYNC_PACK_PAGE_CONTRACT);
  if (restoreId) params.set('restore_id', restoreId);
  if (position.frontierStateSeq !== undefined) {
    params.set('frontier_state_seq', String(position.frontierStateSeq));
  }
  if (position.sourceEpoch) params.set('source_epoch', position.sourceEpoch);
  return `/companion/sync-pack?${params.toString()}`;
}

async function pullRemoteStructurePack(endpointUrl: string, restoreId?: string) {
  const startedAt = Date.now();
  const sourcePeerId = await resolveCompanionSyncPeerId(endpointUrl);
  const sourceHostName = await resolveCompanionSyncPeerHostName(endpointUrl);
  let position: { cursor: number | null; frontierStateSeq?: number; sourceEpoch?: string } = restoreId
    ? await loadCompanionSyncPackRestorePosition(restoreId, sourcePeerId)
    : { cursor: await loadCompanionSyncPackCursor(sourcePeerId) };
  let frontier = position.frontierStateSeq;
  let epoch = position.sourceEpoch;
  let appliedPackBlobCount = 0;
  let appliedPackObjectCount = 0;
  const reviewIds = new Set<string>();
  for (;;) {
    const cursor = position.cursor ?? 0;
    const pathWithQuery = buildPackPath(position, restoreId);
    const result = await withSyncStepTimeout('structure_pack_apply', applyCompanionDesktopSyncPack({
      ...(restoreId ? { expectedRestoreId: restoreId } : {}),
      headers: await createSignedRequestHeaders({ endpointUrl, method: 'GET', pathWithQuery }),
      sourceHostName, sourcePeerId,
      url: `${endpointUrl.trim().replace(/\/+$/, '')}${pathWithQuery}`
    }));
    assertSyncPackCursorAdvance({ appliedFactCount: result.applied_group_fact_count ?? 0,
      appliedObjectCount: result.applied_object_count, currentCursor: cursor,
      handledConflictCount: result.handled_conflict_count ?? 0, toStateSeq: result.to_state_seq,
      verifiedEmptyPage: result.verified_empty_page === true });
    frontier ??= result.frontier_state_seq ?? result.to_state_seq;
    epoch ??= result.source_epoch;
    if (result.frontier_state_seq !== undefined && result.frontier_state_seq !== frontier ||
        result.source_epoch !== undefined && result.source_epoch !== epoch ||
        result.to_state_seq > frontier || result.to_state_seq <= cursor && cursor < frontier) {
      throw new Error('sync_pack_round_changed');
    }
    if (result.to_state_seq > cursor) await saveCompanionSyncPackCursor(result.to_state_seq, sourcePeerId);
    appliedPackBlobCount += result.applied_blob_count;
    appliedPackObjectCount += result.applied_object_count;
    for (const id of result.applied_review_op_ids ?? []) reviewIds.add(id);
    if (result.to_state_seq === frontier) break;
    if (!epoch) throw new Error('sync_pack_source_epoch_missing');
    position = { cursor: result.to_state_seq, frontierStateSeq: frontier, sourceEpoch: epoch };
  }
  return {
    sourcePeerId,
    appliedPackBlobCount, appliedPackObjectCount,
    appliedReviewOpIds: [...reviewIds],
    confirmedStructureStateSeq: frontier,
    syncedStructureElapsedMs: Date.now() - startedAt
  };
}

function pushErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Desktop sync push failed.';
}

function createSkippedStructurePack() {
  return {
    sourcePeerId: null as string | null,
    appliedPackBlobCount: 0,
    appliedPackObjectCount: 0,
    appliedReviewOpIds: [],
    confirmedStructureStateSeq: null,
    syncedStructureElapsedMs: 0
  };
}

function createSkippedPushResult() {
  return {
    pushConflictCount: 0,
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    pushError: null,
    pushRejectedCount: 0
  };
}

function mergeCompanionObjectsSyncResult(args: {
  finalSummary: Awaited<ReturnType<typeof loadCompanionDesktopSyncSummary>> | ReturnType<typeof createSkippedResourceSummary>;
  pack: Awaited<ReturnType<typeof pullRemoteStructurePack>> | ReturnType<typeof createSkippedStructurePack>;
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
    ...args.finalSummary,
    ...args.resources,
    pushConflictCount: args.pushed.pushConflictCount,
    pushError: args.pushed.pushError,
    pushRejectedCount: args.pushed.pushRejectedCount
  };
}

async function runCompanionObjectsSync(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions = {}
): Promise<CompanionDesktopSyncResult> {
  const skipPush = options.resourcesOnly === true || Boolean(options.restoreId);
  const pushed = skipPush
    ? createSkippedPushResult()
    : await withSyncStepTimeout('push_local_changes', pushLocalDirtyObjects(endpointUrl))
      .catch((error) => ({
        pushConflictCount: 0,
        pushedObjectIds: [],
        pushedReviewOpIds: [],
        pushError: pushErrorMessage(error),
        pushRejectedCount: 0
      }));
  const pack = options.resourcesOnly
    ? createSkippedStructurePack()
    : await pullRemoteStructurePack(endpointUrl, options.restoreId);
  if (!options.resourcesOnly) {
    options.onProgress?.({ completed: pack.appliedPackObjectCount, phase: 'structure', total: pack.appliedPackObjectCount });
    await options.onStructureSynced?.();
  }
  const resources = options.includeResources === false
    ? createEmptyResourceStages()
    : await pullResourceStages(endpointUrl, options.onProgress, [],
      pack.sourcePeerId ?? await resolveCompanionSyncPeerId(endpointUrl));
  const finalSummary = options.includeResources === false
    ? createSkippedResourceSummary()
    : await loadCompanionDesktopSyncSummary(endpointUrl, pack.confirmedStructureStateSeq);
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
