import { createEmptyResourceStages,
  createSkippedResourceSummary } from '../../companionDesktopSyncResourceStages';
import { loadCompanionDesktopSyncSummary } from '../../companionDesktopSyncSummary';
import type { CompanionDesktopSyncOptions,
  CompanionDesktopSyncResult } from '../../companionDesktopSyncTypes';
import { loadIosCompanionHostName } from '../runtime/iosCompanionActiveDatabaseReads';

import { traceCompanionSyncStep } from './diagnostics/companionDesktopSyncTrace';
import { runCompanionSyncIdentityRestoreRound } from './syncGroupIdentityRestoreRound';
import { runCompanionSyncIdentityRound } from './syncGroupIdentityRound';

/** Adapt the verified identity round to the companion sync result surface. */
export async function syncCompanionIdentityObjects(endpointUrl: string,
  options: CompanionDesktopSyncOptions): Promise<CompanionDesktopSyncResult> {
  const startedAt = Date.now();
  const hostName = await loadIosCompanionHostName();
  const restored = options.restoreId ? await traceCompanionSyncStep({
    runId: options.runId, stage: 'identity_restore',
    task: () => runCompanionSyncIdentityRestoreRound(endpointUrl, hostName,
      options.restoreId!) }) : null;
  const round = await traceCompanionSyncStep({ runId: options.runId,
    stage: 'identity_round',
    task: () => runCompanionSyncIdentityRound(endpointUrl, hostName,
      { includeResources: options.includeResources !== false }) });
  const appliedPackObjectCount = (restored?.appliedObjects ?? 0) +
    round.received.appliedObjects;
  options.onProgress?.({ completed: appliedPackObjectCount,
    phase: 'structure', total: appliedPackObjectCount });
  await options.onStructureSynced?.();
  const summary = options.includeResources === false ? createSkippedResourceSummary() :
    await loadCompanionDesktopSyncSummary(endpointUrl, 'identity-complete');
  return {
    appliedNodeIds: [], appliedPackBlobCount: 0, appliedPackObjectCount,
    appliedObjectIds: [], appliedReviewOpIds: [], changedObjectIds: [],
    pushedNodeIds: [], pushedObjectIds: [], pushedReviewOpIds: [],
    requestedObjectIds: [], ...summary, ...createEmptyResourceStages(),
    pushConflictCount: 0, pushError: null, pushRejectedCount: 0,
    syncedStructureElapsedMs: Date.now() - startedAt
  };
}
