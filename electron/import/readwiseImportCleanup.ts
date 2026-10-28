import { retireExternalDocument } from '../../lib/core/database/externalDocumentRetirement.js';
import type {
  NativeReadwiseCleanupEntry,
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult
} from '../../lib/platform/nativeImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { deleteNodesPermanently } from '../database/nodeMutations.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { isReadwiseExternalFolderId } from '../database/readwiseManagedExternalDocuments.js';

import { clearPersistedReadwiseBookGeneratedNodes } from './readwiseBooksInventoryState.js';
import { hasReadwiseCleanupAdditions } from './readwiseCleanupAdditions.js';
import {
  collectReadwiseCleanupSubtree,
  isReadwiseBookStructureNodeId,
  type ReadwiseCleanupCandidate,
  reduceReadwiseCleanupRootCandidates
} from './readwiseCleanupStructure.js';
import { readReadwiseBookCleanupCandidates } from './readwiseImportCleanupBooks.js';
import { clearReadwiseTracking, readReadwiseRuleIds } from './readwiseImportCleanupTracking.js';

interface KeepImportCleanupRow {
  last_imported_at: string | null;
  last_node_id: string | null;
  rule_id: string;
  source_path: string;
}

interface NodeCleanupRow {
  created_at: string;
  anchor_link: string | null;
  id: string;
  parent_id: string | null;
  title: string;
  updated_at: string;
}

interface ReadwiseExternalCleanupRow {
  document_id: string;
  folder_id: string;
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
       WHERE local_node_state != 'locally_deleted'
       ORDER BY source_path COLLATE NOCASE ASC`
    )
    .all() as KeepImportCleanupRow[];
  return rows.filter((row) => ruleIds.has(row.rule_id));
}

function readNodeRows() {
  return openDatabaseConnection().sqlite
    .prepare('SELECT id, parent_id, title, anchor_link, created_at, updated_at FROM nodes WHERE deleted_at IS NULL')
    .all() as NodeCleanupRow[];
}

function readReadwiseExternalRows() {
  const rows = openDatabaseConnection().sqlite
    .prepare('SELECT document_id, folder_id FROM external_documents WHERE is_present = 1 ORDER BY folder_id ASC, relative_path COLLATE NOCASE ASC')
    .all() as ReadwiseExternalCleanupRow[];
  return rows.filter((row) => isReadwiseExternalFolderId(row.folder_id));
}

function resolveCleanupAction(
  candidate: ReadwiseCleanupCandidate,
  subtree: NodeCleanupRow[]
): Pick<NativeReadwiseCleanupEntry, 'action' | 'reason'> {
  if (candidate.reason) {
    return { action: 'keep', reason: candidate.reason };
  }
  if (!candidate.importedAt || subtree.length === 0) {
    return { action: 'keep', reason: 'Topic is missing or has no import timestamp.' };
  }
  if (hasReadwiseCleanupAdditions(candidate.nodeId, candidate.importedAt, subtree)) {
    return { action: 'keep', reason: 'Topic has additions after import.' };
  }
  return { action: 'delete', reason: candidate.deleteReason ?? 'Readwise import has no additions.' };
}

function readKeepImportCleanupCandidates(keepRows: KeepImportCleanupRow[]): ReadwiseCleanupCandidate[] {
  return keepRows.filter((row) => row.last_node_id).map((row) => ({
    importedAt: row.last_imported_at,
    nodeId: row.last_node_id ?? '',
    ruleId: row.rule_id,
    sourcePath: row.source_path
  }));
}

function buildCleanupPreview(previewedAt: string): NativeReadwiseCleanupPreviewResult {
  const nodes = readNodeRows();
  const externalRows = readReadwiseExternalRows();
  const keepRows = readKeepImportRows();
  const rootCandidates = reduceReadwiseCleanupRootCandidates(
    [...readKeepImportCleanupCandidates(keepRows), ...readReadwiseBookCleanupCandidates()],
    nodes
  );
  const entries = rootCandidates.map((candidate) => {
    const subtree = collectReadwiseCleanupSubtree(candidate.nodeId, nodes);
    const root = subtree[0];
    const action = resolveCleanupAction(candidate, subtree);
    return {
      ...action,
      node_id: candidate.nodeId,
      rule_id: candidate.ruleId,
      source_path: candidate.sourcePath,
      title: root?.title ?? candidate.title ?? candidate.sourcePath
    } satisfies NativeReadwiseCleanupEntry;
  });
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

function collectDeleteNodeIds(entries: NativeReadwiseCleanupEntry[]) {
  const nodes = readNodeRows();
  return entries
    .filter((entry) => entry.action === 'delete')
    .flatMap((entry) => collectReadwiseCleanupSubtree(entry.node_id, nodes).map((node) => node.id));
}

function collectDetachedNodeIds(entries: NativeReadwiseCleanupEntry[]) {
  const nodes = readNodeRows();
  const activeNodeIds = new Set(nodes.map((node) => node.id));
  return entries
    .filter((entry) => entry.action === 'keep' && activeNodeIds.has(entry.node_id))
    .flatMap((entry) => [
      entry.node_id,
      ...collectReadwiseCleanupSubtree(entry.node_id, nodes).map((node) => node.id)
    ]);
}

function clearReadwiseExternalDocuments(rows: ReadwiseExternalCleanupRow[], deletedAt: string) {
  if (!rows.length) return 0;
  const driver = openDatabaseConnection().driver;
  const hostName = loadOrCreateDesktopHostName(deletedAt);
  return driver.transaction(tx => rows.reduce((count, row) => count + Number(retireExternalDocument(tx, {
    documentId: row.document_id, deletedAt, hostName
  })), 0));
}

export function previewReadwiseImportCleanup(): NativeReadwiseCleanupPreviewResult {
  if (!canCurrentHostRunReadwise('relay')) throw new Error('readwise_not_active_host');
  return buildCleanupPreview(new Date().toISOString());
}

export function runReadwiseImportCleanup(): NativeReadwiseCleanupRunResult {
  if (!canCurrentHostRunReadwise('relay')) throw new Error('readwise_not_active_host');
  const cleanedAt = new Date().toISOString();
  const preview = buildCleanupPreview(cleanedAt);
  const externalRows = readReadwiseExternalRows();
  const deleteNodeIds = collectDeleteNodeIds(preview.entries);
  const detachedNodeIds = collectDetachedNodeIds(preview.entries);
  clearReadwiseTracking({ deletedNodeIds: deleteNodeIds, detachedNodeIds });
  clearPersistedReadwiseBookGeneratedNodes(new Set(deleteNodeIds.filter(isReadwiseBookStructureNodeId)), cleanedAt);
  const externalDeletedCount = clearReadwiseExternalDocuments(externalRows, cleanedAt);
  if (deleteNodeIds.length > 0) {
    deleteNodesPermanently({
      nodeIds: deleteNodeIds
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
