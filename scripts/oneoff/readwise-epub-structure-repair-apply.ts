import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.js';
import { ensureReadwiseUnlocatedNode } from '../../electron/import/readwiseOriginalEpubUnlocated.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import {
  enqueueWorkspaceSearchInvalidationForNodeIds,
  enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds
} from '../../lib/core/database/searchIndexInvalidations.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';

import {
  assertRepairProtectionPreserved,
  captureRepairProtection
} from './readwise-epub-structure-repair-guards.js';
import type { ReadwiseEpubBookRepair, ReadwiseEpubStructureRepairPlan } from './readwise-epub-structure-repair-types.js';

export function applyReadwiseEpubStructureRepair(
  driver: DatabaseDriver,
  plan: ReadwiseEpubStructureRepairPlan,
  now = new Date().toISOString()
) {
  const hostName = requireDatabaseHostName(driver);
  const changedNodeIds = new Set<string>();
  const roots = plan.books.map((book) => book.rootNodeId);
  const before = captureRepairProtection(driver, roots);
  if (JSON.stringify(before.summary) !== JSON.stringify(plan.protection)) {
    throw new Error('readwise_epub_repair_protection_drifted');
  }
  driver.transaction((tx) => {
    plan.books.forEach((book) => applyBook(tx, book, now, changedNodeIds));
    const ids = [...changedNodeIds];
    enqueueWorkspaceSearchInvalidationForNodeIds(tx, ids);
    enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(tx, plan.books.map((book) => book.rootNodeId));
    ids.forEach((nodeId) => {
      if (!flushNodeSyncVersionWithDriver(tx, nodeId, hostName, now)) {
        throw new Error(`readwise_epub_repair_version_failed:${nodeId}`);
      }
    });
    verifyReadwiseEpubStructureRepair(tx, plan);
    const after = captureRepairProtection(tx, roots);
    assertRepairProtectionPreserved(before.details, after.details);
  });
  return { changedNodeIds: [...changedNodeIds], versionCount: changedNodeIds.size };
}

function applyBook(driver: DatabaseDriver, book: ReadwiseEpubBookRepair, now: string, changed: Set<string>) {
  if (book.highlights.some((highlight) => highlight.parentId === book.unlocatedNodeId)) {
    ensureReadwiseUnlocatedNode({
      connectionRef: readConnectionRef(driver, book.rootNodeId),
      documentId: book.documentId,
      driver,
      importedAt: now,
      rootNodeId: book.rootNodeId
    });
    changed.add(book.unlocatedNodeId);
  }
  book.bodies.forEach((body) => applyBody(driver, body, now, changed));
  book.moves.forEach((move) => {
    const result = driver.execute(
      'UPDATE nodes SET parent_id = ?, updated_at = ?, sync_dirty = 1 WHERE id = ? AND deleted_at IS NULL',
      [move.parentId, now, move.nodeId]
    );
    if (result.changes !== 1) throw new Error(`readwise_epub_repair_move_missing:${move.nodeId}`);
    changed.add(move.nodeId);
  });
  book.highlights.forEach((highlight) => {
    const current = driver.queryOne<{ anchor_link: string; image_regions: string | null; parent_id: string }>(
      'SELECT anchor_link, image_regions, parent_id FROM nodes WHERE id = ? AND deleted_at IS NULL',
      [highlight.nodeId]
    );
    if (!current) throw new Error(`readwise_epub_repair_highlight_missing:${highlight.nodeId}`);
    if (current.parent_id === highlight.parentId && current.anchor_link === highlight.anchorLink
      && current.image_regions === highlight.imageRegions) return;
    const result = driver.execute(
      `UPDATE nodes SET parent_id = ?, anchor_link = ?, image_regions = ?,
       updated_at = ?, sync_dirty = 1 WHERE id = ? AND deleted_at IS NULL`,
      [highlight.parentId, highlight.anchorLink, highlight.imageRegions, now, highlight.nodeId]
    );
    if (result.changes !== 1) throw new Error(`readwise_epub_repair_highlight_update_failed:${highlight.nodeId}`);
    changed.add(highlight.nodeId);
  });
  book.attachmentCopies.forEach((attachment) => {
    const result = driver.execute(
      'INSERT OR IGNORE INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)',
      [attachment.nodeId, attachment.attachmentId, attachment.role]
    );
    if (result.changes === 0) return;
    driver.execute('UPDATE nodes SET updated_at = ?, sync_dirty = 1 WHERE id = ?', [now, attachment.nodeId]);
    changed.add(attachment.nodeId);
  });
  if (book.staleNodeIds.length === 0) return;
  const marks = book.staleNodeIds.map(() => '?').join(', ');
  driver.execute(
    `UPDATE nodes SET deleted_at = ?, updated_at = ?, sync_dirty = 1
     WHERE id IN (${marks}) AND deleted_at IS NULL`, [now, now, ...book.staleNodeIds]
  );
  book.staleNodeIds.forEach((nodeId) => changed.add(nodeId));
}

function applyBody(
  driver: DatabaseDriver,
  body: ReadwiseEpubBookRepair['bodies'][number],
  now: string,
  changed: Set<string>
) {
  const current = driver.queryOne<{ content: string; parent_id: string | null; title: string }>(
    'SELECT content, parent_id, title FROM nodes WHERE id = ? AND deleted_at IS NULL', [body.nodeId]
  );
  if (!current) throw new Error(`readwise_epub_repair_body_missing:${body.nodeId}`);
  if (current.content !== body.content) {
    writeNodeBody({ content: body.content, driver, nodeId: body.nodeId, title: body.title, updatedAt: now });
  }
  if (current.content === body.content && current.parent_id === body.parentId && current.title === body.title) return;
  driver.execute(
    `UPDATE nodes SET parent_id = ?, title = ?, is_title_manual = ?,
     updated_at = ?, sync_dirty = 1 WHERE id = ?`,
    [body.parentId, body.title, body.isTitleManual, now, body.nodeId]
  );
  changed.add(body.nodeId);
}

export function verifyReadwiseEpubStructureRepair(
  driver: DatabaseDriver,
  plan: ReadwiseEpubStructureRepairPlan
) {
  for (const book of plan.books) {
    verifyBookBodies(driver, book);
    verifyBookDepth(driver, book);
    for (const highlight of book.highlights) {
      const row = driver.queryOne<{ anchor_link: string; image_regions: string | null; parent_id: string }>(
        'SELECT anchor_link, image_regions, parent_id FROM nodes WHERE id = ? AND deleted_at IS NULL',
        [highlight.nodeId]
      );
      if (!row || row.parent_id !== highlight.parentId || row.anchor_link !== highlight.anchorLink
        || row.image_regions !== highlight.imageRegions) {
        throw new Error(`readwise_epub_repair_highlight_verification_failed:${highlight.nodeId}`);
      }
    }
    if (book.highlights.some((highlight) => highlight.parentId === book.unlocatedNodeId)) {
      const unlocated = driver.queryOne<{ parent_id: string | null; title: string }>(
        'SELECT parent_id, title FROM nodes WHERE id = ? AND deleted_at IS NULL', [book.unlocatedNodeId]
      );
      if (!unlocated || unlocated.parent_id !== book.rootNodeId || unlocated.title !== '※') {
        throw new Error(`readwise_epub_repair_unlocated_verification_failed:${book.documentId}`);
      }
    }
    if (book.staleNodeIds.length === 0) continue;
    const marks = book.staleNodeIds.map(() => '?').join(', ');
    const visible = driver.queryOne<{ count: number }>(
      `SELECT COUNT(*) count FROM nodes WHERE id IN (${marks}) AND deleted_at IS NULL`, book.staleNodeIds
    )?.count ?? -1;
    if (visible !== 0) throw new Error(`readwise_epub_repair_stale_visible:${book.documentId}`);
  }
  return { books: plan.books.length, headings: plan.counts.headings, staleNodes: plan.counts.staleNodes };
}

function readConnectionRef(driver: DatabaseDriver, rootNodeId: string) {
  const row = driver.queryOne<{ remote_connection_ref: string }>(
    'SELECT remote_connection_ref FROM import_sources WHERE latest_node_id = ?', [rootNodeId]
  );
  if (!row) throw new Error(`readwise_epub_repair_source_missing:${rootNodeId}`);
  return row.remote_connection_ref;
}

function verifyBookBodies(driver: DatabaseDriver, book: ReadwiseEpubBookRepair) {
  book.bodies.forEach((body) => {
    const row = driver.queryOne<{ content: string; is_title_manual: number; parent_id: string | null; title: string }>(
      'SELECT content, is_title_manual, parent_id, title FROM nodes WHERE id = ? AND deleted_at IS NULL', [body.nodeId]
    );
    if (!row || row.content !== body.content || row.parent_id !== body.parentId || row.title !== body.title) {
      throw new Error(`readwise_epub_repair_body_verification_failed:${body.nodeId}`);
    }
    if (row.is_title_manual !== body.isTitleManual) {
      throw new Error(`readwise_epub_repair_title_manual_changed:${body.nodeId}`);
    }
  });
}

function verifyBookDepth(driver: DatabaseDriver, book: ReadwiseEpubBookRepair) {
  const depth = driver.queryOne<{ max_depth: number }>(`WITH RECURSIVE tree(id, depth) AS (
    SELECT id, 0 FROM nodes WHERE id = ? AND deleted_at IS NULL
    UNION ALL SELECT child.id, tree.depth + 1 FROM nodes child JOIN tree ON child.parent_id = tree.id
    WHERE child.deleted_at IS NULL AND child.id LIKE 'node-epub-%'
  ) SELECT MAX(depth) max_depth FROM tree`, [book.rootNodeId])?.max_depth ?? -1;
  if (depth < 0 || depth > 3) throw new Error(`readwise_epub_repair_depth_failed:${book.documentId}:${depth}`);
}
