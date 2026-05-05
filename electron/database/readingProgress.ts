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

interface MetaRow {
  value: string;
}

interface NodeViewStateRow {
  node_id: string;
  scroll_top: number;
  selection_from: number | null;
  selection_to: number | null;
  updated_at: string;
}

const ACTIVE_NODE_META_KEY = 'active_node_id';

export function saveReadingProgress(input: SaveReadingProgressInput): void {
  const connection = openDatabaseConnection();
  const upsertMetaStatement = connection.sqlite.prepare(
    `INSERT INTO workspace_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  );
  const upsertNodeViewStateStatement = connection.sqlite.prepare(
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
    upsertMetaStatement.run(ACTIVE_NODE_META_KEY, input.activeNodeId ?? '', input.updatedAt);
    for (const state of input.nodeViewStates) {
      upsertNodeViewStateStatement.run(
        state.nodeId,
        state.scrollTop,
        state.selectionFrom,
        state.selectionTo,
        input.updatedAt
      );
    }
  });
}

export function loadReadingProgress(): ReadingProgressSnapshot {
  const connection = openDatabaseConnection();
  const activeNodeRow = connection.sqlite
    .prepare('SELECT value FROM workspace_meta WHERE key = ?')
    .get(ACTIVE_NODE_META_KEY) as MetaRow | undefined;
  const nodeRows = connection.sqlite
    .prepare(
      `SELECT
         node_id,
         scroll_top,
         selection_from,
         selection_to,
         updated_at
       FROM node_view_state`
    )
    .all() as NodeViewStateRow[];

  const nodeViewStateById: Record<string, NodeViewStateSnapshot> = {};
  for (const row of nodeRows) {
    nodeViewStateById[row.node_id] = {
      scrollTop: row.scroll_top,
      selectionFrom: row.selection_from,
      selectionTo: row.selection_to,
      updatedAt: row.updated_at
    };
  }

  return {
    activeNodeId: activeNodeRow && activeNodeRow.value !== '' ? activeNodeRow.value : null,
    nodeViewStateById
  };
}
