import type { NativeMirrorOutputRebuildResult } from '../../lib/platform/nativeUtilityContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';

import { orderMirrorPlansForMigration } from './mirrorDirectoryOwnership.js';
import { removeEmptyMirrorParents } from './mirrorOutputDirectory.js';
import { processMirrorPlans, type MirrorSyncMode, type MirrorSyncOptions } from './mirrorOutputPlans.js';
import {
  captureMirrorOutputSnapshot,
  createMirrorPlanCurrency,
  type MirrorPlanCurrency
} from './mirrorOutputSnapshot.js';
import {
  clearMirrorArticleRecords,
  deleteMirrorArticleRecord,
  type MirrorArticleRecord,
  removeMirrorFileAndLegacyDirectory,
  resetMirrorRoot,
  resolveAbsoluteMirrorPath
} from './mirrorOutputStorage.js';
import { collectChangedMirrorOwners } from './mirrorPathOwnership.js';
import { scheduleMirrorSync } from './mirrorSyncScheduler.js';

async function prepareFullMirrorRebuild(mirrorRoot: string, currency: MirrorPlanCurrency) {
  await runWithDatabaseConnectionOwner(async () => {
    await resetMirrorRoot(mirrorRoot);
    await currency.ownWrite(() => clearMirrorArticleRecords(), (records) => records.clear());
  });
}

async function removeObsoleteMirrorRecords(
  currency: MirrorPlanCurrency,
  mode: MirrorSyncMode,
  mirrorRoot: string,
  recordsByArticleId: Map<string, MirrorArticleRecord>,
  targetArticleIds: Set<string>,
  selectedArticleIds?: Set<string>
) {
  if (mode === 'missing') {
    return;
  }
  for (const record of recordsByArticleId.values()) {
    if (selectedArticleIds && !selectedArticleIds.has(record.articleId)) {
      continue;
    }
    if (targetArticleIds.has(record.articleId)) {
      continue;
    }
    await runWithDatabaseConnectionOwner(async () => {
      if (!currency.isArticleStillAbsent(record.articleId)) return;
      const previousPath = resolveAbsoluteMirrorPath(mirrorRoot, record.relativePath);
      await removeMirrorFileAndLegacyDirectory(previousPath, currency.retirementProtectedPaths(record.articleId).paths);
      await removeEmptyMirrorParents(previousPath, mirrorRoot);
      await currency.ownWrite(() => deleteMirrorArticleRecord(record.articleId), (records) => records.delete(record.articleId));
    });
  }
}

async function syncMirrorOutput(
  mode: MirrorSyncMode,
  options: MirrorSyncOptions = {},
  attempt = 1
): Promise<NativeMirrorOutputRebuildResult> {
  const updatedAt = new Date().toISOString();
  const { captured, currency } = await runWithDatabaseConnectionOwner(() => {
    const capturedOutput = captureMirrorOutputSnapshot(true, mode === 'incremental' ? options.articleIds : undefined);
    return { captured: capturedOutput, currency: createMirrorPlanCurrency(capturedOutput) };
  });
  const { paths, plans, recordsByArticleId, snapshot } = captured;
  const targetArticleIds = new Set(plans.map((plan) => plan.articleId));
  const selectedArticleIds = options.articleIds?.length ? new Set(options.articleIds) : undefined;
  const changedOwners = collectChangedMirrorOwners(plans, recordsByArticleId, selectedArticleIds);
  const selectedPlans = orderMirrorPlansForMigration(selectedArticleIds
    ? plans.filter((plan) => selectedArticleIds.has(plan.articleId) || changedOwners.has(plan.articleId)) : plans,
  mode === 'full' ? new Map() : recordsByArticleId);

  if (mode === 'full') await prepareFullMirrorRebuild(paths.mirror, currency);
  await removeObsoleteMirrorRecords(currency, mode, paths.mirror, recordsByArticleId, targetArticleIds, selectedArticleIds);

  const processed = snapshot
    ? await processMirrorPlans({ currency, mode, options, paths, plans: selectedPlans, recordsByArticleId, updatedAt, snapshot, changedOwners })
    : { pendingArticleIds: [], rebuiltArticleCount: 0 };

  const pendingArticleIds = processed.pendingArticleIds.length
    ? await runWithDatabaseConnectionOwner(() => [...new Set([
      ...processed.pendingArticleIds, ...currency.changedPlanPaths(selectedPlans)
    ])]) : [];
  if (pendingArticleIds.length > 0 && attempt < 3) {
    const retry = await syncMirrorOutput('incremental', {
      articleIds: pendingArticleIds,
      ...(options.taskContext ? { taskContext: options.taskContext } : {})
    }, attempt + 1);
    return {
      ...retry,
      queued_article_count: processed.rebuiltArticleCount + retry.queued_article_count,
      rebuilt_article_count: processed.rebuiltArticleCount + retry.rebuilt_article_count
    };
  }
  if (pendingArticleIds.length > 0) scheduleMirrorSync(pendingArticleIds);

  return {
    queued_article_count: mode === 'full' ? plans.length : processed.rebuiltArticleCount,
    rebuilt_article_count: processed.rebuiltArticleCount,
    failed_article_count: 0,
    pending_article_count: pendingArticleIds.length,
    updated_at: updatedAt
  };
}

export function rebuildAllMirrorOutput() {
  return syncMirrorOutput('full');
}

export function syncIncrementalMirrorOutput(articleIds?: string[], taskContext?: DesktopTaskContext) {
  return syncMirrorOutput('incremental', {
    ...(articleIds?.length ? { articleIds } : {}),
    ...(taskContext ? { taskContext } : {})
  });
}

export function backfillMissingMirrorOutput(context?: DesktopTaskContext) {
  return syncMirrorOutput('missing', context ? { taskContext: context } : {});
}

export function resumePendingMirrorOutput(context?: DesktopTaskContext) {
  return syncMirrorOutput('incremental', context ? { taskContext: context } : {});
}
