import { promises as fs } from 'node:fs';
import path from 'node:path';

import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { NativeMirrorOutputRebuildResult } from '../../lib/platform/nativeUtilityContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import type { MirrorRenderableNode } from './articleMirrorOutput.js';
import { collectArticleMirrorPlans, type ArticleMirrorPlan } from './articleMirrorPlanning.js';
import { renderArticleMirrorInWorker } from './articleMirrorRenderWorkerClient.js';
import { pruneMirrorOutputToTargets } from './mirrorOutputPrune.js';
import {
  clearMirrorArticleRecords,
  deleteMirrorArticleRecord,
  loadMirrorArticleRecords,
  type MirrorArticleRecord,
  readMirrorFileUpdatedAt,
  removeLegacyMirrorArtifacts,
  removeMirrorFileAndLegacyDirectory,
  resetMirrorRoot,
  resolveAbsoluteMirrorPath,
  saveMirrorArticleRecord
} from './mirrorOutputStorage.js';

type MirrorSyncMode = 'full' | 'incremental' | 'missing';

interface MirrorSyncOptions {
  articleIds?: string[];
  taskContext?: DesktopTaskContext;
}

function hydrateMirrorPlanBodies(
  snapshot: NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>,
  plan: ArticleMirrorPlan
) {
  const nodeIds = [plan.articleId, ...plan.derivedNodeIds, ...plan.manualTopicIds];
  if (nodeIds.length === 0) return snapshot;
  const placeholders = nodeIds.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<NodeBodyRow & { id: string }>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id IN (${placeholders}) AND n.deleted_at IS NULL`,
    nodeIds
  );
  for (const row of rows) {
    const node = snapshot.nodesById[row.id];
    if (node) {
      node.content = requireResolvedNodeBody(row, row.id).content;
    }
  }
  return snapshot;
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
  hydrateMirrorPlanBodies(snapshot, plan);
  return renderArticleMirrorInWorker({
    article: requireRenderableNode(snapshot, plan.articleId),
    derivedChildren: plan.derivedNodeIds.map((nodeId) => requireRenderableNode(snapshot, nodeId)),
    manualTopics: plan.manualTopicIds.map((nodeId) => requireRenderableNode(snapshot, nodeId))
  }, signal);
}

async function prepareFullMirrorRebuild(mirrorRoot: string) {
  await resetMirrorRoot(mirrorRoot);
  clearMirrorArticleRecords();
}

async function removeObsoleteMirrorRecords(
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
    await removeMirrorFileAndLegacyDirectory(resolveAbsoluteMirrorPath(mirrorRoot, record.relativePath));
    deleteMirrorArticleRecord(record.articleId);
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

async function processMirrorPlans(args: {
  mode: MirrorSyncMode;
  options: MirrorSyncOptions;
  paths: ReturnType<typeof loadLibraryPathSettingsSync>;
  plans: ArticleMirrorPlan[];
  recordsByArticleId: Map<string, MirrorArticleRecord>;
  snapshot: NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>;
  updatedAt: string;
}) {
  let rebuiltArticleCount = 0;
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
    if (shouldWriteTarget(args.mode, fileUpdatedAt, effectiveRecord, plan.sourceUpdatedAt) || pathChanged) {
      if (persistedRecord && persistedRecord.relativePath !== plan.relativePath) {
        await removeMirrorFileAndLegacyDirectory(resolveAbsoluteMirrorPath(args.paths.mirror, persistedRecord.relativePath));
      }
      await args.options.taskContext?.yieldIfNeeded();
      const markdown = await renderMirrorPlan(
        args.snapshot,
        plan,
        args.options.taskContext?.signal
      );
      await fs.mkdir(path.dirname(plan.targetPath), { recursive: true });
      await fs.writeFile(plan.targetPath, markdown, 'utf8');
      saveMirrorArticleRecord({ articleId: plan.articleId, mirroredAt: args.updatedAt, relativePath: plan.relativePath });
      rebuiltArticleCount += 1;
    } else if (!persistedRecord && effectiveRecord) {
      saveMirrorArticleRecord(effectiveRecord);
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
  return rebuiltArticleCount;
}

async function syncMirrorOutput(
  mode: MirrorSyncMode,
  options: MirrorSyncOptions = {}
): Promise<NativeMirrorOutputRebuildResult> {
  const updatedAt = new Date().toISOString();
  const paths = loadLibraryPathSettingsSync();
  const snapshot = loadWorkspaceSnapshot({ includeBody: false });
  const plans = snapshot ? collectArticleMirrorPlans(snapshot, paths.mirror) : [];
  const recordsByArticleId = loadMirrorArticleRecords();
  const targetArticleIds = new Set(plans.map((plan) => plan.articleId));
  const selectedArticleIds = options.articleIds?.length ? new Set(options.articleIds) : undefined;
  const selectedPlans = selectedArticleIds ? plans.filter((plan) => selectedArticleIds.has(plan.articleId)) : plans;

  if (mode === 'full') {
    await prepareFullMirrorRebuild(paths.mirror);
  } else if (mode === 'incremental') {
    await pruneMirrorOutputToTargets(paths.mirror, plans.map((plan) => plan.targetPath));
  }

  await removeObsoleteMirrorRecords(mode, paths.mirror, recordsByArticleId, targetArticleIds, selectedArticleIds);

  await removeLegacyMirrorArtifacts(paths.mirror, selectedPlans.map((plan) => plan.targetPath));

  const rebuiltArticleCount = snapshot
    ? await processMirrorPlans({ mode, options, paths, plans: selectedPlans, recordsByArticleId, updatedAt, snapshot })
    : 0;

  return {
    queued_article_count: mode === 'full' ? plans.length : rebuiltArticleCount,
    rebuilt_article_count: rebuiltArticleCount,
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
