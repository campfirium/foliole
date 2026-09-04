import { promises as fs } from 'node:fs';
import path from 'node:path';

import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { NativeMirrorOutputRebuildResult } from '../../lib/platform/nativeUtilityContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { collectArticleMirrorTargets } from './articleMirrorOutput.js';
import { pruneMirrorOutputToTargets } from './mirrorOutputPrune.js';

type MirrorSyncMode = 'full' | 'incremental' | 'missing';

interface MirrorArticleRecord {
  articleId: string;
  mirroredAt: string;
  relativePath: string;
}

interface MirrorSyncOptions {
  articleIds?: string[];
  taskContext?: DesktopTaskContext;
}

function hydrateMirrorSnapshotBodies(snapshot: NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>) {
  const rows = openDatabaseConnection().driver.queryAll<NodeBodyRow & { id: string }>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE (n.kind = 'topic' OR n.anchor_link IS NOT NULL)
       AND n.deleted_at IS NULL`,
    []
  );
  for (const row of rows) {
    const node = snapshot.nodesById[row.id];
    if (node) {
      node.content = requireResolvedNodeBody(row, row.id).content;
    }
  }
  return snapshot;
}

function loadMirrorArticleRecords() {
  const rows = openDatabaseConnection().sqlite
    .prepare('SELECT article_id, relative_path, mirrored_at FROM mirror_articles')
    .all() as Array<{ article_id: string; mirrored_at: string; relative_path: string }>;

  return new Map(
    rows.map((row) => [
      row.article_id,
      {
        articleId: row.article_id,
        mirroredAt: row.mirrored_at,
        relativePath: row.relative_path
      } satisfies MirrorArticleRecord
    ])
  );
}

function saveMirrorArticleRecord(record: MirrorArticleRecord) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO mirror_articles (article_id, relative_path, mirrored_at)
       VALUES (?, ?, ?)
       ON CONFLICT(article_id) DO UPDATE SET
         relative_path = excluded.relative_path,
         mirrored_at = excluded.mirrored_at`
    )
    .run(record.articleId, record.relativePath, record.mirroredAt);
}

function deleteMirrorArticleRecord(articleId: string) {
  openDatabaseConnection().sqlite.prepare('DELETE FROM mirror_articles WHERE article_id = ?').run(articleId);
}

function clearMirrorArticleRecords() {
  openDatabaseConnection().sqlite.prepare('DELETE FROM mirror_articles').run();
}

function resolveAbsoluteMirrorPath(mirrorRoot: string, relativePath: string) {
  return path.join(mirrorRoot, ...relativePath.split('/'));
}

function resolveLegacyArticleDirectory(filePath: string) {
  return path.join(path.dirname(filePath), path.basename(filePath, '.md'));
}

async function readFileUpdatedAt(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? stats.mtime.toISOString() : null;
  } catch {
    return null;
  }
}

async function removeMirrorFileAndLegacyDirectory(filePath: string) {
  await fs.rm(filePath, { force: true });
  await fs.rm(resolveLegacyArticleDirectory(filePath), { force: true, recursive: true });
}

async function removeLegacyMirrorArtifacts(mirrorRoot: string, targetPaths: string[]) {
  await Promise.all([
    fs.rm(path.join(mirrorRoot, 'Highlights.md'), { force: true }),
    fs.rm(path.join(mirrorRoot, 'Clozes.md'), { force: true })
  ]);

  await Promise.all(targetPaths.map((targetPath) => fs.rm(resolveLegacyArticleDirectory(targetPath), { force: true, recursive: true })));
}

async function resetMirrorRoot(mirrorRoot: string) {
  await fs.mkdir(mirrorRoot, { recursive: true });
  const entries = await fs.readdir(mirrorRoot);
  await Promise.all(entries.map((entry) => fs.rm(path.join(mirrorRoot, entry), { recursive: true, force: true })));
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

async function processMirrorTargets(args: {
  mode: MirrorSyncMode;
  options: MirrorSyncOptions;
  paths: ReturnType<typeof loadLibraryPathSettingsSync>;
  recordsByArticleId: Map<string, MirrorArticleRecord>;
  targets: ReturnType<typeof collectArticleMirrorTargets>;
  updatedAt: string;
}) {
  let rebuiltArticleCount = 0;
  let visitedArticleCount = 0;
  for (const target of args.targets) {
    if (args.options.taskContext?.signal.aborted) {
      throw new DOMException('AbortError', 'AbortError');
    }
    const persistedRecord = args.recordsByArticleId.get(target.articleId) ?? null;
    const fileUpdatedAt = await readFileUpdatedAt(target.targetPath);
    const effectiveRecord =
      persistedRecord ??
      (fileUpdatedAt ? { articleId: target.articleId, mirroredAt: fileUpdatedAt, relativePath: target.relativePath } : null);
    const pathChanged = Boolean(persistedRecord && persistedRecord.relativePath !== target.relativePath);
    if (shouldWriteTarget(args.mode, fileUpdatedAt, effectiveRecord, target.sourceUpdatedAt) || pathChanged) {
      if (persistedRecord && persistedRecord.relativePath !== target.relativePath) {
        await removeMirrorFileAndLegacyDirectory(resolveAbsoluteMirrorPath(args.paths.mirror, persistedRecord.relativePath));
      }
      await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
      await fs.writeFile(target.targetPath, target.markdown, 'utf8');
      saveMirrorArticleRecord({ articleId: target.articleId, mirroredAt: args.updatedAt, relativePath: target.relativePath });
      rebuiltArticleCount += 1;
    } else if (!persistedRecord && effectiveRecord) {
      saveMirrorArticleRecord(effectiveRecord);
    }
    visitedArticleCount += 1;
    args.options.taskContext?.progress({
      completed: visitedArticleCount,
      message: 'processed mirror target',
      total: args.targets.length,
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
  const hydratedSnapshot = snapshot ? hydrateMirrorSnapshotBodies(snapshot) : null;
  const targets = hydratedSnapshot ? collectArticleMirrorTargets(hydratedSnapshot, paths.mirror) : [];
  const recordsByArticleId = loadMirrorArticleRecords();
  const targetArticleIds = new Set(targets.map((target) => target.articleId));
  const selectedArticleIds = options.articleIds?.length ? new Set(options.articleIds) : undefined;
  const selectedTargets = selectedArticleIds ? targets.filter((target) => selectedArticleIds.has(target.articleId)) : targets;

  if (mode === 'full') {
    await prepareFullMirrorRebuild(paths.mirror);
  } else if (mode === 'incremental') {
    await pruneMirrorOutputToTargets(paths.mirror, targets.map((target) => target.targetPath));
  }

  await removeObsoleteMirrorRecords(mode, paths.mirror, recordsByArticleId, targetArticleIds, selectedArticleIds);

  await removeLegacyMirrorArtifacts(paths.mirror, selectedTargets.map((target) => target.targetPath));

  const rebuiltArticleCount = await processMirrorTargets({ mode, options, paths, recordsByArticleId, targets: selectedTargets, updatedAt });

  return {
    queued_article_count: mode === 'full' ? targets.length : rebuiltArticleCount,
    rebuilt_article_count: rebuiltArticleCount,
    failed_article_count: 0,
    pending_article_count: 0,
    updated_at: updatedAt
  };
}

export function rebuildAllMirrorOutput() {
  return syncMirrorOutput('full');
}

export function syncIncrementalMirrorOutput(articleIds?: string[]) {
  return syncMirrorOutput('incremental', articleIds?.length ? { articleIds } : {});
}

export function backfillMissingMirrorOutput(context?: DesktopTaskContext) {
  return syncMirrorOutput('missing', context ? { taskContext: context } : {});
}
