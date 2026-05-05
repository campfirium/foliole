import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { appendReadingPositionTraceRecord } from '../readingPositionTraceLog.js';

import { openDatabaseConnection } from './connection.js';
import { withTransaction } from './transaction.js';

export interface NodeViewStateInput {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
}

export interface SaveReadingProgressInput {
  activeNodeId: string | null;
  nodeViewStates: NodeViewStateInput[];
  updatedAt: string;
}

export interface NodeViewStateSnapshot {
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  updatedAt: string;
}

export interface ReadingProgressSnapshot {
  activeNodeId: string | null;
  nodeViewStateById: Record<string, NodeViewStateSnapshot>;
}

interface MetaRow extends DatabaseRow {
  value: string;
}

interface NodeViewStateRow extends DatabaseRow {
  node_id: string;
  scroll_top: number;
  selection_from: number | null;
  selection_to: number | null;
  updated_at: string;
}

const ACTIVE_NODE_META_KEY = 'active_node_id';

export function saveReadingProgress(input: SaveReadingProgressInput): void {
  appendReadingPositionTraceRecord({
    event: 'reading-progress.db-save',
    payload: {
      activeNodeId: input.activeNodeId,
      nodeIds: input.nodeViewStates.map((state) => state.nodeId),
      scrollTops: input.nodeViewStates.map((state) => state.scrollTop),
      updatedAt: input.updatedAt
    },
    timestamp: Date.now()
  });
  const connection = openDatabaseConnection();
  const upsertMetaStatement = connection.driver.prepare(
    `INSERT INTO workspace_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  );
  const upsertNodeViewStateStatement = connection.driver.prepare(
    `INSERT INTO node_view_state (
       node_id,
       scroll_top,
       selection_from,
       selection_to,
       updated_at
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       scroll_top = excluded.scroll_top,
       selection_from = excluded.selection_from,
       selection_to = excluded.selection_to,
       updated_at = excluded.updated_at`
  );

  withTransaction(connection.driver, () => {
    upsertMetaStatement.run([ACTIVE_NODE_META_KEY, input.activeNodeId ?? '', input.updatedAt]);
    for (const state of input.nodeViewStates) {
      upsertNodeViewStateStatement.run([
        state.nodeId,
        state.scrollTop,
        state.selectionFrom,
        state.selectionTo,
        input.updatedAt
      ]);
    }
  });
}

export function loadReadingProgress(): ReadingProgressSnapshot {
  const connection = openDatabaseConnection();
  const activeNodeRow = connection.driver.queryOne<MetaRow>(
    'SELECT value FROM workspace_meta WHERE key = ?',
    [ACTIVE_NODE_META_KEY]
  );
  const nodeRows = connection.driver.queryAll<NodeViewStateRow>(
    `SELECT
       node_id,
       scroll_top,
       selection_from,
       selection_to,
       updated_at
     FROM node_view_state`
  );

  const nodeViewStateById: Record<string, NodeViewStateSnapshot> = {};
  for (const row of nodeRows) {
    nodeViewStateById[row.node_id] = {
      scrollTop: row.scroll_top,
      selectionFrom: row.selection_from,
      selectionTo: row.selection_to,
      updatedAt: row.updated_at
    };
  }

  const snapshot = {
    activeNodeId: activeNodeRow && activeNodeRow.value !== '' ? activeNodeRow.value : null,
    nodeViewStateById
  };
  appendReadingPositionTraceRecord({
    event: 'reading-progress.db-load',
    payload: {
      activeNodeId: snapshot.activeNodeId,
      nodeViewStateCount: Object.keys(snapshot.nodeViewStateById).length
    },
    timestamp: Date.now()
  });
  return snapshot;
}
