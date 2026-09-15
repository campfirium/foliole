import { createHash } from 'node:crypto';

import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import { ensureReadwiseUnlocatedNode } from '../../electron/import/readwiseOriginalEpubUnlocated.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import {
  enqueueWorkspaceSearchInvalidationForNodeIds,
  enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds
} from '../../lib/core/database/searchIndexInvalidations.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';

import type { DuplicateRootBookMerge, DuplicateRootRepairPlan } from './readwise-epub-duplicate-root-types.js';

export function applyDuplicateRootRepair(
  driver: DatabaseDriver,
  plan: DuplicateRootRepairPlan,
  now = new Date().toISOString()
) {
  const changed = new Set<string>();
  const hostName = requireDatabaseHostName(driver);
  driver.transaction((tx) => {
    plan.books.forEach((book) => applyBook(tx, book, now, changed));
    updateCutoverJournal(tx, plan.books, now);
    const ids = [...changed];
    enqueueWorkspaceSearchInvalidationForNodeIds(tx, ids);
    enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(tx, plan.books.map((book) => book.legacyRootId));
    ids.forEach((id) => {
      if (!flushNodeSyncVersionWithDriver(tx, id, hostName, now)) {
        throw new Error(`readwise_duplicate_root_version_failed:${id}`);
      }
    });
    verifyDuplicateRootRepair(tx, plan);
  });
  return { changedNodeIds: [...changed], versionCount: changed.size };
}

function applyBook(driver: DatabaseDriver, book: DuplicateRootBookMerge, now: string, changed: Set<string>) {
  assertBookState(driver, book);
  book.directApiChildIds.forEach((id) => move(driver, id, book.legacyRootId, now, changed));
  writeNodeBody({ content: book.rootBody, driver, nodeId: book.legacyRootId, title: book.legacyTitle, updatedAt: now });
  driver.execute(`UPDATE nodes SET import_source_fingerprint=(SELECT import_source_fingerprint FROM nodes WHERE id=?),
      import_content_fingerprint=(SELECT import_content_fingerprint FROM nodes WHERE id=?),
      updated_at=?, sync_dirty=1 WHERE id=?`, [book.apiRootId, book.apiRootId, now, book.legacyRootId]);
  changed.add(book.legacyRootId);
  book.generatedTransfers.forEach((item) => transferFacts(driver, item.sourceId, item.targetId, now));
  book.highlightMerges.forEach((item) => {
    readChildren(driver, item.sourceId).forEach((id) => move(driver, id, item.targetId, now, changed));
    transferFacts(driver, item.sourceId, item.targetId, now);
    retire(driver, item.sourceId, now, changed);
  });
  book.moves.forEach((item) => move(driver, item.nodeId, item.parentId, now, changed));
  if (book.relocatedHighlights.some((item) => item.parentId === book.unlocatedNodeId)) {
    const source = readSource(driver, book.apiRootId);
    ensureReadwiseUnlocatedNode({
      connectionRef: source.connectionRef, documentId: book.documentId, driver,
      importedAt: now, rootNodeId: book.legacyRootId
    });
    changed.add(book.unlocatedNodeId);
  }
  book.relocatedHighlights.forEach((item) => {
    driver.execute(`UPDATE nodes SET parent_id=?, anchor_link=?, image_regions=?, updated_at=?, sync_dirty=1
      WHERE id=? AND deleted_at IS NULL`, [item.parentId, item.anchorLink, item.imageRegions, now, item.nodeId]);
    changed.add(item.nodeId);
  });
  book.legacyGeneratedIds.forEach((id) => retire(driver, id, now, changed));
  transferFacts(driver, book.apiRootId, book.legacyRootId, now);
  const result = driver.execute('UPDATE import_sources SET latest_node_id=? WHERE latest_node_id=?', [
    book.legacyRootId, book.apiRootId
  ]);
  if (result.changes !== 1) throw new Error(`readwise_duplicate_root_source_update_failed:${book.documentId}`);
  retire(driver, book.apiRootId, now, changed);
}

function transferFacts(driver: DatabaseDriver, sourceId: string, targetId: string, now: string) {
  if (sourceId === targetId) return;
  copyReading(driver, sourceId, targetId);
  copyReview(driver, sourceId, targetId);
  driver.execute(`INSERT OR IGNORE INTO node_attachments(node_id,attachment_id,role)
    SELECT ?,attachment_id,role FROM node_attachments WHERE node_id=?`, [targetId, sourceId]);
  driver.execute('DELETE FROM node_attachments WHERE node_id=?', [sourceId]);
  driver.execute(`INSERT OR IGNORE INTO node_view_state(node_id,host_name,scroll_top,selection_from,selection_to,source,updated_at)
    SELECT ?,host_name,scroll_top,selection_from,selection_to,source,updated_at FROM node_view_state WHERE node_id=?`,
  [targetId, sourceId]);
  driver.execute('DELETE FROM node_view_state WHERE node_id=?', [sourceId]);
  const opened = driver.queryOne<{ last_opened_at: string }>('SELECT last_opened_at FROM node_open_state WHERE node_id=?', [sourceId]);
  if (opened) {
    driver.execute(`INSERT INTO node_open_state(node_id,last_opened_at) VALUES(?,?) ON CONFLICT(node_id)
      DO UPDATE SET last_opened_at=max(last_opened_at,excluded.last_opened_at)`, [targetId, opened.last_opened_at]);
    driver.execute('DELETE FROM node_open_state WHERE node_id=?', [sourceId]);
  }
  driver.execute('UPDATE review_log SET node_id=? WHERE node_id=?', [targetId, sourceId]);
  driver.execute('UPDATE virtual_folder_items SET material_node_id=?, updated_at=? WHERE material_node_id=?', [
    targetId, now, sourceId
  ]);
}

function copyReading(driver: DatabaseDriver, sourceId: string, targetId: string) {
  const source = driver.queryOne<Record<string, unknown> & { repetition_count: number }>(
    'SELECT * FROM node_reading WHERE node_id=?', [sourceId]
  );
  if (!source) return;
  const target = driver.queryOne<{ repetition_count: number }>('SELECT repetition_count FROM node_reading WHERE node_id=?', [targetId]);
  if (!target || source.repetition_count > target.repetition_count) {
    driver.execute(`INSERT OR REPLACE INTO node_reading SELECT ?,interval_duration_ms,interval_growth_factor,
      last_handled_at,next_at,priority,repetition_count,state FROM node_reading WHERE node_id=?`, [targetId, sourceId]);
  }
  driver.execute('DELETE FROM node_reading WHERE node_id=?', [sourceId]);
}

function copyReview(driver: DatabaseDriver, sourceId: string, targetId: string) {
  const source = driver.queryOne<{ reps: number }>('SELECT reps FROM node_review WHERE node_id=?', [sourceId]);
  if (!source) return;
  const target = driver.queryOne<{ reps: number }>('SELECT reps FROM node_review WHERE node_id=?', [targetId]);
  if (target && target.reps > source.reps) throw new Error(`readwise_duplicate_review_conflict:${sourceId}`);
  driver.execute(`INSERT OR REPLACE INTO node_review SELECT ?,due,last_review_at,state,stability,difficulty,
    elapsed_days,scheduled_days,reps,lapses FROM node_review WHERE node_id=?`, [targetId, sourceId]);
  driver.execute('DELETE FROM node_review WHERE node_id=?', [sourceId]);
}

function move(driver: DatabaseDriver, id: string, parentId: string, now: string, changed: Set<string>) {
  const result = driver.execute(
    'UPDATE nodes SET parent_id=?,updated_at=?,sync_dirty=1 WHERE id=? AND deleted_at IS NULL', [parentId, now, id]
  );
  if (result.changes !== 1) throw new Error(`readwise_duplicate_move_missing:${id}`);
  changed.add(id);
}

function retire(driver: DatabaseDriver, id: string, now: string, changed: Set<string>) {
  driver.execute('DELETE FROM node_order WHERE node_id=?', [id]);
  const result = driver.execute(
    'UPDATE nodes SET deleted_at=?,updated_at=?,sync_dirty=1 WHERE id=? AND deleted_at IS NULL', [now, now, id]
  );
  if (result.changes !== 1) throw new Error(`readwise_duplicate_retire_missing:${id}`);
  changed.add(id);
}

function assertBookState(driver: DatabaseDriver, book: DuplicateRootBookMerge) {
  const source = readSource(driver, book.apiRootId);
  if (source.documentId !== book.documentId) throw new Error(`readwise_duplicate_source_drift:${book.documentId}`);
  const roots = driver.queryAll<{ id: string; parent_id: string; title: string }>(
    'SELECT id,parent_id,title FROM nodes WHERE id IN (?,?) AND deleted_at IS NULL', [book.apiRootId, book.legacyRootId]
  );
  if (roots.length !== 2 || roots.find((row) => row.id === book.apiRootId)?.parent_id !== 'special-inbox'
    || roots.find((row) => row.id === book.legacyRootId)?.title !== book.legacyTitle) {
    throw new Error(`readwise_duplicate_root_drift:${book.documentId}`);
  }
}

function readSource(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<{ connectionRef: string; documentId: string }>(`SELECT
    remote_connection_ref connectionRef,remote_document_id documentId FROM import_sources
    WHERE latest_node_id=? AND remote_provider='readwise'`, [nodeId]);
  if (!row) throw new Error(`readwise_duplicate_source_missing:${nodeId}`);
  return row;
}

function readChildren(driver: DatabaseDriver, parentId: string) {
  return driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE parent_id=? AND deleted_at IS NULL', [parentId])
    .map((row) => row.id);
}

function updateCutoverJournal(driver: DatabaseDriver, books: DuplicateRootBookMerge[], now: string) {
  const row = driver.queryOne<{ value: string }>("SELECT value FROM settings WHERE key='readwise_source_cutover_v2'");
  if (!row) throw new Error('readwise_duplicate_cutover_missing');
  const state = JSON.parse(row.value) as { documents: Array<{ nodeId?: string; remoteId: string }> };
  const byDocument = new Map(books.map((book) => [book.documentId, book.legacyRootId]));
  state.documents.forEach((item) => { if (byDocument.has(item.remoteId)) item.nodeId = byDocument.get(item.remoteId); });
  const value = JSON.stringify(state);
  driver.execute("UPDATE settings SET value=?,updated_at=? WHERE key='readwise_source_cutover_v2'", [value, now]);
  driver.execute(`UPDATE setting_records SET value_json=?,content_hash=?,updated_at=?
    WHERE key='readwise_source_cutover_v2'`, [value, createHash('sha256').update(value).digest('hex'), now]);
}

export function verifyDuplicateRootRepair(driver: DatabaseDriver, plan: DuplicateRootRepairPlan) {
  const cutover = driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'"
  );
  const journal = JSON.parse(cutover?.value ?? '{}') as {
    documents?: Array<{ nodeId?: string; remoteId: string }>;
  };
  for (const book of plan.books) {
    const source = readSource(driver, book.legacyRootId);
    if (source.documentId !== book.documentId) throw new Error(`readwise_duplicate_verify_source:${book.documentId}`);
    const visibleWrongRoot = driver.queryOne<{ count: number }>(
      'SELECT count(*) count FROM nodes WHERE id=? AND deleted_at IS NULL', [book.apiRootId]
    )?.count ?? -1;
    const childCount = driver.queryOne<{ count: number }>(
      "SELECT count(*) count FROM nodes WHERE parent_id=? AND deleted_at IS NULL AND id LIKE 'node-epub-%'", [book.legacyRootId]
    )?.count ?? 0;
    const journalNodeId = journal.documents?.find((item) => item.remoteId === book.documentId)?.nodeId;
    if (visibleWrongRoot !== 0 || childCount === 0 || journalNodeId !== book.legacyRootId) {
      throw new Error(`readwise_duplicate_verify_root:${book.documentId}`);
    }
  }
  const deletedParentOrphans = driver.queryOne<{ count: number }>(`SELECT count(*) count FROM nodes child
    JOIN nodes parent ON parent.id=child.parent_id WHERE child.deleted_at IS NULL AND parent.deleted_at IS NOT NULL`
  )?.count ?? -1;
  if (deletedParentOrphans !== 0) throw new Error(`readwise_duplicate_active_orphans:${deletedParentOrphans}`);
  return { books: plan.books.length, inboxRootsRetired: plan.books.length };
}
