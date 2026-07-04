import { createHash } from 'node:crypto';
import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';

export const INCOMING_UPDATE_SOURCE_TYPE_IMPORT_FILE = 'import_file';
export const INCOMING_UPDATE_STATUS_PENDING = 'pending';

export interface IncomingUpdateRecord {
  createdAt: string;
  id: string;
  sourcePath: string;
  sourceType: typeof INCOMING_UPDATE_SOURCE_TYPE_IMPORT_FILE;
  status: typeof INCOMING_UPDATE_STATUS_PENDING;
  topicId: string;
  updatedAt: string;
  updatedContent: string;
}

interface IncomingUpdateRow extends DatabaseRow {
  created_at: string;
  id: string;
  source_path: string;
  source_type: typeof INCOMING_UPDATE_SOURCE_TYPE_IMPORT_FILE;
  status: typeof INCOMING_UPDATE_STATUS_PENDING;
  topic_id: string;
  updated_at: string;
  updated_content: string;
}

interface MirrorArticleTopicRow extends DatabaseRow {
  article_id: string;
  relative_path: string;
}

interface ImportedTopicRow extends DatabaseRow {
  node_id: string;
}

export interface IncomingUpdateTargetInput {
  relativePath: string;
  sourceLocator?: string;
}

function normalizeRelativePath(value: string) {
  return value.split(path.sep).join('/').replace(/\\/g, '/');
}

export function resolveImportRelativePath(rootPath: string, filePath: string) {
  const relativePath = path.relative(rootPath, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return normalizeRelativePath(relativePath);
}

function createIncomingUpdateId(topicId: string, sourcePath: string) {
  const hash = createHash('sha256').update(`${topicId}\0${sourcePath}`).digest('hex').slice(0, 24);
  return `incoming-update-${hash}`;
}

function findMirrorTopicByRelativePath(relativePath: string) {
  const rows = openDatabaseConnection().driver.queryAll<MirrorArticleTopicRow>(
    `SELECT mirror.article_id, mirror.relative_path
     FROM mirror_articles mirror
     INNER JOIN nodes node ON node.id = mirror.article_id
     WHERE mirror.relative_path = ?
       AND node.deleted_at IS NULL`,
    [relativePath]
  );
  return rows.length === 1 ? rows[0] : null;
}

function findFirstLiveImportTopicBySourceLocator(sourceLocator: string) {
  return openDatabaseConnection().driver.queryOne<ImportedTopicRow>(
    `SELECT run.node_id
     FROM import_runs run
     INNER JOIN nodes node ON node.id = run.node_id
     WHERE run.source_locator = ?
       AND run.result_status = 'imported'
       AND run.node_id IS NOT NULL
       AND node.deleted_at IS NULL
     ORDER BY run.imported_at ASC
     LIMIT 1`,
    [sourceLocator]
  );
}

function hasAnchorDerivedChildren(topicId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM nodes
     WHERE parent_id = ?
       AND anchor_link IS NOT NULL
       AND deleted_at IS NULL`,
    [topicId]
  );
  return (row?.count ?? 0) > 0;
}

function resolveMirrorIncomingUpdateTarget(relativePath: string) {
  const mirrorTopic = findMirrorTopicByRelativePath(relativePath);
  if (!mirrorTopic) {
    return null;
  }
  if (hasAnchorDerivedChildren(mirrorTopic.article_id)) {
    return null;
  }

  return {
    sourcePath: mirrorTopic.relative_path,
    topicId: mirrorTopic.article_id
  };
}

function resolveHistoricalImportIncomingUpdateTarget(input: IncomingUpdateTargetInput) {
  if (!input.sourceLocator) {
    return null;
  }
  const importedTopic = findFirstLiveImportTopicBySourceLocator(input.sourceLocator);
  if (!importedTopic || hasAnchorDerivedChildren(importedTopic.node_id)) {
    return null;
  }

  return {
    sourcePath: input.relativePath,
    topicId: importedTopic.node_id
  };
}

export function resolveIncomingUpdateTarget(input: IncomingUpdateTargetInput) {
  return (
    resolveMirrorIncomingUpdateTarget(input.relativePath) ??
    resolveHistoricalImportIncomingUpdateTarget(input)
  );
}

export function upsertPendingIncomingUpdate(args: {
  importedAt: string;
  sourcePath: string;
  topicId: string;
  updatedContent: string;
}) {
  const existing = openDatabaseConnection().driver.queryOne<{ created_at: string; id: string }>(
    `SELECT id, created_at
     FROM incoming_updates
     WHERE topic_id = ?
       AND source_type = ?
       AND source_path = ?
       AND status = ?`,
    [args.topicId, INCOMING_UPDATE_SOURCE_TYPE_IMPORT_FILE, args.sourcePath, INCOMING_UPDATE_STATUS_PENDING]
  );
  const id = existing?.id ?? createIncomingUpdateId(args.topicId, args.sourcePath);
  openDatabaseConnection().driver.execute(
    `INSERT INTO incoming_updates (
       id, topic_id, source_type, source_path, updated_content, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(topic_id, source_type, source_path, status) DO UPDATE SET
       updated_content = excluded.updated_content,
       updated_at = excluded.updated_at`,
    [
      id,
      args.topicId,
      INCOMING_UPDATE_SOURCE_TYPE_IMPORT_FILE,
      args.sourcePath,
      args.updatedContent,
      INCOMING_UPDATE_STATUS_PENDING,
      existing?.created_at ?? args.importedAt,
      args.importedAt
    ]
  );
  return id;
}

export function loadPendingIncomingUpdate(topicId: string): IncomingUpdateRecord | null {
  const row = openDatabaseConnection().driver.queryOne<IncomingUpdateRow>(
    `SELECT id, topic_id, source_type, source_path, updated_content, status, created_at, updated_at
     FROM incoming_updates
     WHERE topic_id = ?
       AND status = ?
     ORDER BY updated_at DESC
    LIMIT 1`,
    [topicId, INCOMING_UPDATE_STATUS_PENDING]
  );
  return row ? toIncomingUpdateRecord(row) : null;
}

export function clearPendingIncomingUpdate(id: string) {
  openDatabaseConnection().driver.execute(
    `DELETE FROM incoming_updates
     WHERE id = ?
       AND status = ?`,
    [id, INCOMING_UPDATE_STATUS_PENDING]
  );
}

function toIncomingUpdateRecord(row: IncomingUpdateRow): IncomingUpdateRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    sourcePath: row.source_path,
    sourceType: row.source_type,
    status: row.status,
    topicId: row.topic_id,
    updatedAt: row.updated_at,
    updatedContent: row.updated_content
  };
}

export function loadPendingIncomingUpdateById(id: string): IncomingUpdateRecord | null {
  const row = openDatabaseConnection().driver.queryOne<IncomingUpdateRow>(
    `SELECT id, topic_id, source_type, source_path, updated_content, status, created_at, updated_at
     FROM incoming_updates
     WHERE id = ?
       AND status = ?`,
    [id, INCOMING_UPDATE_STATUS_PENDING]
  );
  return row ? toIncomingUpdateRecord(row) : null;
}
