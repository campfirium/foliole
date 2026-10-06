import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeMirrorOutputRebuildResult } from '../../lib/platform/nativeUtilityContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import type { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';
import type { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import type { MirrorRenderableNode } from './articleMirrorOutput.js';
import type { ArticleMirrorPlan } from './articleMirrorPlanning.js';
import { renderArticleMirrorInWorker } from './articleMirrorRenderWorkerClient.js';
import { pruneMirrorOutputToTargets } from './mirrorOutputPrune.js';
import {
  captureMirrorOutputSnapshot,
  isMirrorArticleStillAbsent,
  isMirrorPlanCurrent,
  mirrorPlanRevision
} from './mirrorOutputSnapshot.js';
import {
  clearMirrorArticleRecords,
  deleteMirrorArticleRecord,
  type MirrorArticleRecord,
  readMirrorFileUpdatedAt,
  removeLegacyMirrorArtifacts,
  removeMirrorFileAndLegacyDirectory,
  resetMirrorRoot,
  resolveAbsoluteMirrorPath,
  saveMirrorArticleRecord
} from './mirrorOutputStorage.js';
import { collectProtectedMirrorPaths } from './mirrorPathIdentity.js';
import { collectChangedMirrorOwners } from './mirrorPathOwnership.js';

type MirrorSyncMode = 'full' | 'incremental' | 'missing';

interface MirrorSyncOptions {
  articleIds?: string[];
  taskContext?: DesktopTaskContext;
}

function requireRenderableNode(
  snapshot: NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>,
  nodeId: string
): MirrorRenderableNode {
  const node = snapshot.nodesById[nodeId];
  if (!node) throw new Error(`Mirror render node is missing: ${nodeId}`);
  return node;
}

async function renderMirrorPlan(
  snapshot: NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>,
  plan: ArticleMirrorPlan,
  signal?: AbortSignal
) {
  return renderArticleMirrorInWorker({
    article: requireRenderableNode(snapshot, plan.articleId),
    derivedChildren: plan.derivedNodeIds.map((nodeId) => requireRenderableNode(snapshot, nodeId)),
    manualTopics: plan.manualTopicIds.map((nodeId) => requireRenderableNode(snapshot, nodeId))
  }, signal);
}

async function prepareFullMirrorRebuild(mirrorRoot: string) {
  await runWithDatabaseConnectionOwner(async () => {
    await resetMirrorRoot(mirrorRoot);
    clearMirrorArticleRecords();
  });
}

async function removeObsoleteMirrorRecords(
  mode: MirrorSyncMode,
  mirrorRoot: string,
  recordsByArticleId: Map<string, MirrorArticleRecord>,
  targetArticleIds: Set<string>,
  protectedPaths: Set<string>,
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
      if (!isMirrorArticleStillAbsent(record.articleId)) return;
      await removeMirrorFileAndLegacyDirectory(resolveAbsoluteMirrorPath(mirrorRoot, record.relativePath), protectedPaths);
      deleteMirrorArticleRecord(record.articleId);
    });
  }
}

function shouldWriteTarget(mode: MirrorSyncMode, fileUpdatedAt: string | null, record: MirrorArticleRecord | null, sourceUpdatedAt: string) {
  if (mode === 'full') {
    return true;
  }
  if (mode === 'missing') {
    return fileUpdatedAt === null;
  }
  if (fileUpdatedAt === null) {
    return true;
  }
  if (!record) {
    return true;
  }
  return record.mirroredAt < sourceUpdatedAt;
}

async function commitRenderedMirror(args: {
  markdown: string;
  paths: ReturnType<typeof loadLibraryPathSettingsSync>;
  persistedRecord: MirrorArticleRecord | null;
  plan: ArticleMirrorPlan;
  protectedPaths: Set<string>;
  revision: string;
  updatedAt: string;
}) {
  return runWithDatabaseConnectionOwner(async () => {
    if (!isMirrorPlanCurrent(args.plan.articleId, args.revision)) return false;
    if (args.persistedRecord && args.persistedRecord.relativePath !== args.plan.relativePath) {
      await removeMirrorFileAndLegacyDirectory(
        resolveAbsoluteMirrorPath(args.paths.mirror, args.persistedRecord.relativePath), args.protectedPaths);
    }
    await fs.mkdir(path.dirname(args.plan.targetPath), { recursive: true });
    await fs.writeFile(args.plan.targetPath, args.markdown, 'utf8');
    saveMirrorArticleRecord({ articleId: args.plan.articleId,
      mirroredAt: args.updatedAt, relativePath: args.plan.relativePath });
    return true;
  });
}

async function processMirrorPlans(args: {
  mode: MirrorSyncMode;
  options: MirrorSyncOptions;
  paths: ReturnType<typeof loadLibraryPathSettingsSync>;
  plans: ArticleMirrorPlan[];
  recordsByArticleId: Map<string, MirrorArticleRecord>;
  snapshot: NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>;
  updatedAt: string;
  protectedPaths: Set<string>;
  changedOwners: Set<string>;
}) {
  let rebuiltArticleCount = 0;
  const pendingArticleIds: string[] = [];
  let visitedArticleCount = 0;
  for (const plan of args.plans) {
    if (args.options.taskContext?.signal.aborted) {
      throw new DOMException('AbortError', 'AbortError');
    }
    const persistedRecord = args.recordsByArticleId.get(plan.articleId) ?? null;
    const fileUpdatedAt = await readMirrorFileUpdatedAt(plan.targetPath);
    const effectiveRecord =
      persistedRecord ??
      (fileUpdatedAt ? { articleId: plan.articleId, mirroredAt: fileUpdatedAt, relativePath: plan.relativePath } : null);
    const pathChanged = Boolean(persistedRecord && persistedRecord.relativePath !== plan.relativePath);
    if (shouldWriteTarget(args.mode, fileUpdatedAt, effectiveRecord, plan.sourceUpdatedAt) || pathChanged || args.changedOwners.has(plan.articleId)) {
      await args.options.taskContext?.yieldIfNeeded();
      const markdown = await renderMirrorPlan(
        args.snapshot,
        plan,
        args.options.taskContext?.signal
      );
      const revision = mirrorPlanRevision(args.snapshot, plan);
      const committed = await commitRenderedMirror({ markdown, paths: args.paths, persistedRecord,
        plan, protectedPaths: args.protectedPaths, revision, updatedAt: args.updatedAt });
      if (committed) rebuiltArticleCount += 1;
      else {
        pendingArticleIds.push(plan.articleId);
        args.options.taskContext?.progress({ completed: visitedArticleCount,
          message: 'mirror source changed; retry queued', total: args.plans.length, unit: 'article' });
      }
    } else if (!persistedRecord && effectiveRecord) {
      await runWithDatabaseConnectionOwner(() => saveMirrorArticleRecord(effectiveRecord));
    }
    visitedArticleCount += 1;
    args.options.taskContext?.progress({
      completed: visitedArticleCount,
      message: 'processed mirror target',
      total: args.plans.length,
      unit: 'article'
    });
    await args.options.taskContext?.yieldIfNeeded();
  }
  return { pendingArticleIds, rebuiltArticleCount };
}

async function syncMirrorOutput(
  mode: MirrorSyncMode,
  options: MirrorSyncOptions = {}
): Promise<NativeMirrorOutputRebuildResult> {
  const updatedAt = new Date().toISOString();
  const captured = await runWithDatabaseConnectionOwner(captureMirrorOutputSnapshot);
  const { paths, plans, recordsByArticleId, snapshot } = captured;
  const targetArticleIds = new Set(plans.map((plan) => plan.articleId));
  const selectedArticleIds = options.articleIds?.length ? new Set(options.articleIds) : undefined;
  const changedOwners = collectChangedMirrorOwners(plans, recordsByArticleId);
  const protectedPaths = collectProtectedMirrorPaths(plans.map((plan) => plan.targetPath));
  const selectedPlans = selectedArticleIds
    ? plans.filter((plan) => selectedArticleIds.has(plan.articleId) || changedOwners.has(plan.articleId)) : plans;

  if (mode === 'full') {
    await prepareFullMirrorRebuild(paths.mirror);
  } else if (mode === 'incremental') {
    await runWithDatabaseConnectionOwner(() => {
      const current = captureMirrorOutputSnapshot();
      return pruneMirrorOutputToTargets(current.paths.mirror, current.plans.map((plan) => plan.targetPath));
    });
  }

  await removeObsoleteMirrorRecords(mode, paths.mirror, recordsByArticleId, targetArticleIds, protectedPaths, selectedArticleIds);

  await runWithDatabaseConnectionOwner(() => {
    const current = captureMirrorOutputSnapshot();
    const currentProtectedPaths = collectProtectedMirrorPaths(current.plans.map((plan) => plan.targetPath));
    return removeLegacyMirrorArtifacts(
      current.paths.mirror, current.plans.map((plan) => plan.targetPath), currentProtectedPaths);
  });

  const processed = snapshot
    ? await processMirrorPlans({ mode, options, paths, plans: selectedPlans, recordsByArticleId, updatedAt, snapshot, protectedPaths, changedOwners })
    : { pendingArticleIds: [], rebuiltArticleCount: 0 };

  if (processed.pendingArticleIds.length > 0) {
    const retry = await syncMirrorOutput('incremental', {
      articleIds: processed.pendingArticleIds,
      ...(options.taskContext ? { taskContext: options.taskContext } : {})
    });
    return {
      ...retry,
      queued_article_count: processed.rebuiltArticleCount + retry.queued_article_count,
      rebuilt_article_count: processed.rebuiltArticleCount + retry.rebuilt_article_count
    };
  }

  return {
    queued_article_count: mode === 'full' ? plans.length : processed.rebuiltArticleCount,
    rebuilt_article_count: processed.rebuiltArticleCount,
    failed_article_count: 0,
    pending_article_count: 0,
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
