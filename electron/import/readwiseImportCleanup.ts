import type {
  NativeReadwiseCleanupEntry,
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult
} from '../../lib/platform/nativeImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { deleteNodesPermanently } from '../database/nodeMutations.js';
import { isReadwiseExternalFolderId } from '../database/readwiseManagedExternalDocuments.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { readReadwiseBookCleanupEntries } from './readwiseImportCleanupBooks.js';

interface KeepImportCleanupRow {
  last_imported_at: string | null;
  last_node_id: string | null;
  rule_id: string;
  source_path: string;
}

interface NodeCleanupRow {
  created_at: string;
  id: string;
  parent_id: string | null;
  title: string;
  updated_at: string;
}

interface ReadwiseExternalCleanupRow {
  document_id: string;
  folder_id: string;
}

function readReadwiseRuleIds() {
  return new Set(
    loadImportManagerSettings()
      .readwiseSources
      .filter((source) => source.kind)
      .map((source) => source.id)
  );
}

function readKeepImportRows() {
  const ruleIds = readReadwiseRuleIds();
  if (ruleIds.size === 0) {
    return [];
  }
  const rows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT rule_id, source_path, last_node_id, last_imported_at
       FROM keep_import_items
       ORDER BY source_path COLLATE NOCASE ASC`
    )
    .all() as KeepImportCleanupRow[];
  return rows.filter((row) => ruleIds.has(row.rule_id));
}

function readNodeRows() {
  return openDatabaseConnection().sqlite
    .prepare('SELECT id, parent_id, title, created_at, updated_at FROM nodes WHERE deleted_at IS NULL')
    .all() as NodeCleanupRow[];
}

function readReadwiseExternalRows() {
  const rows = openDatabaseConnection().sqlite
    .prepare('SELECT document_id, folder_id FROM external_documents WHERE is_present = 1 ORDER BY folder_id ASC, relative_path COLLATE NOCASE ASC')
    .all() as ReadwiseExternalCleanupRow[];
  return rows.filter((row) => isReadwiseExternalFolderId(row.folder_id));
}

function collectSubtree(rootId: string, rows: NodeCleanupRow[]) {
  const byParent = new Map<string | null, NodeCleanupRow[]>();
  rows.forEach((row) => {
    byParent.set(row.parent_id, [...(byParent.get(row.parent_id) ?? []), row]);
  });
  const collected: NodeCleanupRow[] = [];
  const visit = (nodeId: string) => {
    const row = rows.find((candidate) => candidate.id === nodeId);
    if (!row) {
      return;
    }
    collected.push(row);
    (byParent.get(nodeId) ?? []).forEach((child) => visit(child.id));
  };
  visit(rootId);
  return collected;
}

function hasLearningState(nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return false;
  }
  const placeholders = nodeIds.map(() => '?').join(', ');
  const row = openDatabaseConnection().sqlite
    .prepare(
      `SELECT 1 AS found FROM node_review WHERE node_id IN (${placeholders})
       UNION ALL
       SELECT 1 AS found FROM node_reading WHERE node_id IN (${placeholders})
       LIMIT 1`
    )
    .get(...nodeIds, ...nodeIds) as { found: number } | undefined;
  return Boolean(row);
}

function resolveCleanupAction(row: KeepImportCleanupRow, subtree: NodeCleanupRow[]): Pick<NativeReadwiseCleanupEntry, 'action' | 'reason'> {
  if (!row.last_imported_at || subtree.length === 0) {
    return { action: 'keep', reason: 'Topic is missing or has no import timestamp.' };
  }
  const nodeIds = subtree.map((node) => node.id);
  if (hasLearningState(nodeIds)) {
    return { action: 'keep', reason: 'Topic has reading or review state.' };
  }
  const changedNode = subtree.find(
    (node) => node.updated_at !== row.last_imported_at || node.created_at > row.last_imported_at
  );
  if (changedNode) {
    return { action: 'keep', reason: 'Topic or child topics were changed after import.' };
  }
  return { action: 'delete', reason: 'Readwise import is unchanged.' };
}

function buildCleanupPreview(previewedAt: string): NativeReadwiseCleanupPreviewResult {
  const nodes = readNodeRows();
  const externalRows = readReadwiseExternalRows();
  const keepRows = readKeepImportRows();
  const keepEntries = keepRows.filter((row) => row.last_node_id).map((row) => {
    const subtree = collectSubtree(row.last_node_id ?? '', nodes);
    const root = subtree[0];
    const action = resolveCleanupAction(row, subtree);
    return {
      ...action,
      node_id: row.last_node_id ?? '',
      rule_id: row.rule_id,
      source_path: row.source_path,
      title: root?.title ?? row.source_path
    } satisfies NativeReadwiseCleanupEntry;
  });
  const entries = [...keepEntries, ...readReadwiseBookCleanupEntries()];
  const trackingOnlyCount = keepRows.filter((row) => !row.last_node_id).length;
  return {
    delete_count: entries.filter((entry) => entry.action === 'delete').length,
    entries,
    external_document_count: externalRows.length,
    external_folder_count: new Set(externalRows.map((row) => row.folder_id)).size,
    keep_count: entries.filter((entry) => entry.action === 'keep').length,
    previewed_at: previewedAt,
    tracking_only_count: trackingOnlyCount,
    total_count: entries.length + externalRows.length + trackingOnlyCount
  };
}

function readRemainingNodeOrder(deletedIds: Set<string>) {
  return (
    openDatabaseConnection().sqlite
      .prepare('SELECT node_id FROM node_order ORDER BY position ASC')
      .all() as Array<{ node_id: string }>
  ).map((row) => row.node_id).filter((nodeId) => !deletedIds.has(nodeId));
}

function collectDeleteNodeIds(entries: NativeReadwiseCleanupEntry[]) {
  const nodes = readNodeRows();
  return entries
    .filter((entry) => entry.action === 'delete')
    .flatMap((entry) => collectSubtree(entry.node_id, nodes).map((node) => node.id));
}

function clearReadwiseTracking(entries: NativeReadwiseCleanupEntry[]) {
  const connection = openDatabaseConnection();
  const ruleIds = readReadwiseRuleIds();
  const deleteKeepImport = connection.sqlite.prepare('DELETE FROM keep_import_items WHERE rule_id = ?');
  const deleteImportRuns = connection.sqlite.prepare('DELETE FROM import_runs WHERE node_id = ?');
  const deleteImportSources = connection.sqlite.prepare('DELETE FROM import_sources WHERE latest_node_id = ?');
  connection.sqlite.transaction(() => {
    ruleIds.forEach((ruleId) => {
      deleteKeepImport.run(ruleId);
    });
    entries.forEach((entry) => {
      deleteImportRuns.run(entry.node_id);
      deleteImportSources.run(entry.node_id);
    });
  })();
}

function clearReadwiseExternalDocuments(rows: ReadwiseExternalCleanupRow[]) {
  if (rows.length === 0) {
    return 0;
  }
  const connection = openDatabaseConnection();
  const deleteExternalDocument = connection.sqlite.prepare('DELETE FROM external_documents WHERE document_id = ?');
  const deleteExternalSyncState = connection.sqlite.prepare(
    "DELETE FROM sync_object_state WHERE object_type = 'external_document' AND object_id = ?"
  );
  connection.sqlite.transaction(() => {
    rows.forEach((row) => {
      deleteExternalDocument.run(row.document_id);
      deleteExternalSyncState.run(row.document_id);
    });
  })();
  return rows.length;
}

export function previewReadwiseImportCleanup(): NativeReadwiseCleanupPreviewResult {
  return buildCleanupPreview(new Date().toISOString());
}

export function runReadwiseImportCleanup(): NativeReadwiseCleanupRunResult {
  const cleanedAt = new Date().toISOString();
  const preview = buildCleanupPreview(cleanedAt);
  const externalRows = readReadwiseExternalRows();
  const deleteNodeIds = collectDeleteNodeIds(preview.entries);
  const deletedIdSet = new Set(deleteNodeIds);
  clearReadwiseTracking(preview.entries);
  const externalDeletedCount = clearReadwiseExternalDocuments(externalRows);
  if (deleteNodeIds.length > 0) {
    deleteNodesPermanently({
      nodeIds: deleteNodeIds,
      nodeOrder: readRemainingNodeOrder(deletedIdSet)
    });
  }
  return {
    ...preview,
    cleaned_at: cleanedAt,
    deleted_count: preview.delete_count,
    detached_count: preview.keep_count,
    external_deleted_count: externalDeletedCount,
    status: 'completed'
  };
}
