import type { NativeResetImportDataResult } from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';

interface CountRow {
  count: number;
}

interface NodeEdgeRow {
  id: string;
  parent_id: string | null;
}

interface OrderedNodeRow {
  node_id: string;
}

interface WorkspaceMetaRow {
  value: string;
}

const ACTIVE_NODE_META_KEY = 'active_node_id';

function readCount(sql: string) {
  const row = openDatabaseConnection().sqlite.prepare(sql).get() as CountRow;
  return row.count;
}

function listImportedRootNodeIds() {
  const rows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT DISTINCT node_id
       FROM (
         SELECT latest_node_id AS node_id FROM import_sources
         UNION ALL
         SELECT node_id FROM import_runs
         UNION ALL
         SELECT last_node_id AS node_id FROM keep_import_items
       )
       WHERE node_id IS NOT NULL`
    )
    .all() as Array<{ node_id: string }>;
  return rows.map((row) => row.node_id);
}

function listImportedNodeIds(rootNodeIds: string[]) {
  if (!rootNodeIds.length) {
    return [];
  }

  const rows = openDatabaseConnection().sqlite.prepare('SELECT id, parent_id FROM nodes').all() as NodeEdgeRow[];
  const childIdsByParent = new Map<string | null, string[]>();
  const existingNodeIds = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    const siblings = childIdsByParent.get(row.parent_id) ?? [];
    siblings.push(row.id);
    childIdsByParent.set(row.parent_id, siblings);
  }

  const visited = new Set<string>();
  const orderedNodeIds: string[] = [];
  const visitNode = (nodeId: string) => {
    if (visited.has(nodeId) || !existingNodeIds.has(nodeId)) {
      return;
    }
    visited.add(nodeId);
    for (const childId of childIdsByParent.get(nodeId) ?? []) {
      visitNode(childId);
    }
    orderedNodeIds.push(nodeId);
  };

  for (const rootNodeId of rootNodeIds) {
    visitNode(rootNodeId);
  }
  return orderedNodeIds;
}

function listRemainingRootNodeIds(deletedNodeIds: Set<string>) {
  const rows = openDatabaseConnection().sqlite
    .prepare('SELECT node_id FROM node_order ORDER BY position ASC')
    .all() as OrderedNodeRow[];
  return rows.map((row) => row.node_id).filter((nodeId) => !deletedNodeIds.has(nodeId));
}

export function resetImportData(): NativeResetImportDataResult {
  const connection = openDatabaseConnection();
  const rootNodeIds = listImportedRootNodeIds();
  const deletedNodeIds = listImportedNodeIds(rootNodeIds);
  const deletedNodeIdSet = new Set(deletedNodeIds);
  const remainingRootNodeIds = listRemainingRootNodeIds(deletedNodeIdSet);
  const activeNodeRow = connection.sqlite
    .prepare('SELECT value FROM workspace_meta WHERE key = ?')
    .get(ACTIVE_NODE_META_KEY) as WorkspaceMetaRow | undefined;
  const clearActiveNode = Boolean(activeNodeRow?.value && deletedNodeIdSet.has(activeNodeRow.value));
  const result = {
    clearedImportRunCount: readCount('SELECT COUNT(*) AS count FROM import_runs'),
    clearedImportSourceCount: readCount('SELECT COUNT(*) AS count FROM import_sources'),
    clearedKeepImportItemCount: readCount('SELECT COUNT(*) AS count FROM keep_import_items'),
    deletedNodeCount: deletedNodeIds.length,
    deletedRootNodeCount: rootNodeIds.length
  } satisfies NativeResetImportDataResult;

  const deleteImportRuns = connection.sqlite.prepare('DELETE FROM import_runs');
  const deleteImportSources = connection.sqlite.prepare('DELETE FROM import_sources');
  const deleteKeepImportItems = connection.sqlite.prepare('DELETE FROM keep_import_items');
  const deleteReviewLog = connection.sqlite.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReview = connection.sqlite.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReading = connection.sqlite.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeViewState = connection.sqlite.prepare('DELETE FROM node_view_state WHERE node_id = ?');
  const deleteNodeOrder = connection.sqlite.prepare('DELETE FROM node_order WHERE node_id = ?');
  const deleteNode = connection.sqlite.prepare('DELETE FROM nodes WHERE id = ?');
  const clearNodeOrder = connection.sqlite.prepare('DELETE FROM node_order');
  const insertNodeOrder = connection.sqlite.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');
  const clearActiveNodeStatement = connection.sqlite.prepare('DELETE FROM workspace_meta WHERE key = ?');

  connection.sqlite.transaction(() => {
    deleteKeepImportItems.run();
    deleteImportRuns.run();
    deleteImportSources.run();

    for (const nodeId of deletedNodeIds) {
      deleteReviewLog.run(nodeId);
      deleteNodeReview.run(nodeId);
      deleteNodeReading.run(nodeId);
      deleteNodeViewState.run(nodeId);
      deleteNodeOrder.run(nodeId);
    }
    for (const nodeId of deletedNodeIds) {
      deleteNode.run(nodeId);
    }

    if (clearActiveNode) {
      clearActiveNodeStatement.run(ACTIVE_NODE_META_KEY);
    }

    clearNodeOrder.run();
    for (let index = 0; index < remainingRootNodeIds.length; index += 1) {
      insertNodeOrder.run(remainingRootNodeIds[index], index);
    }
  })();

  return result;
}
