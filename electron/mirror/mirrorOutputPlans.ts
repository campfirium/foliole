import { promises as fs } from 'node:fs';
import path from 'node:path';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import type { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';
import type { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import type { MirrorRenderableNode } from './articleMirrorOutput.js';
import type { ArticleMirrorPlan } from './articleMirrorPlanning.js';
import { renderArticleMirrorInWorker } from './articleMirrorRenderWorkerClient.js';
import { writeRenamedMirror } from './mirrorOutputRename.js';
import { type MirrorPlanCurrency, mirrorPlanRevision } from './mirrorOutputSnapshot.js';
import { type MirrorArticleRecord, readMirrorFileUpdatedAt,
  resolveAbsoluteMirrorPath, saveMirrorArticleRecord } from './mirrorOutputStorage.js';

export type MirrorSyncMode = 'full' | 'incremental' | 'missing';

export interface MirrorSyncOptions {
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

export async function renderMirrorPlan(
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
  currency: MirrorPlanCurrency;
  markdown: string;
  paths: ReturnType<typeof loadLibraryPathSettingsSync>;
  persistedRecord: MirrorArticleRecord | null;
  plan: ArticleMirrorPlan;
  revision: string;
  updatedAt: string;
}) {
  return runWithDatabaseConnectionOwner(async () => {
    if (!args.currency.isPlanCurrent(args.plan.articleId, args.revision)) return false;
    if (args.persistedRecord && args.persistedRecord.relativePath !== args.plan.relativePath) {
      await writeRenamedMirror(args.plan.targetPath, args.markdown,
        resolveAbsoluteMirrorPath(args.paths.mirror, args.persistedRecord.relativePath),
        () => args.currency.retirementProtectedPaths(args.plan.articleId));
    } else {
      await fs.mkdir(path.dirname(args.plan.targetPath), { recursive: true });
      await fs.writeFile(args.plan.targetPath, args.markdown, 'utf8');
    }
    const record = { articleId: args.plan.articleId, mirroredAt: args.updatedAt, relativePath: args.plan.relativePath };
    await args.currency.ownWrite(() => saveMirrorArticleRecord(record), (records) => records.set(record.articleId, record));
    return true;
  });
}

export async function processMirrorPlans(args: {
  currency: MirrorPlanCurrency;
  mode: MirrorSyncMode;
  options: MirrorSyncOptions;
  paths: ReturnType<typeof loadLibraryPathSettingsSync>;
  plans: ArticleMirrorPlan[];
  recordsByArticleId: Map<string, MirrorArticleRecord>;
  snapshot: NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>;
  updatedAt: string;
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
      const committed = await commitRenderedMirror({ currency: args.currency, markdown, paths: args.paths, persistedRecord,
        plan, revision, updatedAt: args.updatedAt });
      if (committed) rebuiltArticleCount += 1;
      else {
        pendingArticleIds.push(plan.articleId);
        args.options.taskContext?.progress({ completed: visitedArticleCount,
          message: 'mirror source changed; retry queued', total: args.plans.length, unit: 'article' });
      }
    } else if (!persistedRecord && effectiveRecord) {
      await runWithDatabaseConnectionOwner(() => args.currency.ownWrite(() => saveMirrorArticleRecord(effectiveRecord),
        (records) => records.set(effectiveRecord.articleId, effectiveRecord)));
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
