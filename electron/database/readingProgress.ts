import type { DatabaseRow, DatabaseStatement } from '../../lib/core/database/driver.js';
import {
  normalizeNodeViewStateWriteSource,
  shouldWritePersistedNodeViewState,
  type NodeViewStateWriteSource,
  type PersistedNodeViewState
} from '../../lib/platform/persistedNodeViewState.js';
import { appendReadingPositionTraceRecord } from '../readingPositionTraceLog.js';

import { openDatabaseConnection, type DatabaseConnection } from './connection.js';
import { loadDesktopDeviceId, loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { withTransaction } from './transaction.js';
import { writeActiveNodeViewStateSync, writeNodeViewStateSync } from './viewStateSync.js';

export interface NodeViewStateInput {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  updatedAt?: string | null;
}

export interface SaveReadingProgressInput {
  activeNodeId: string | null;
  nodeViewStates: NodeViewStateInput[];
  source?: NodeViewStateWriteSource;
  updatedAt: string;
}

export interface NodeViewStateSnapshot {
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  source: NodeViewStateWriteSource;
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
  source?: string | null;
  updated_at: string;
}

const ACTIVE_NODE_META_KEY = 'active_node_id';

export function saveReadingProgress(input: SaveReadingProgressInput): void {
  const deviceId = loadOrCreateDesktopDeviceId(input.updatedAt);
  const source = normalizeNodeViewStateWriteSource(input.source);
  traceReadingProgressSave(input);
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
       device_id,
       scroll_top,
       selection_from,
       selection_to,
       source,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id, device_id) DO UPDATE SET
       scroll_top = excluded.scroll_top,
       selection_from = excluded.selection_from,
       selection_to = excluded.selection_to,
       source = excluded.source,
       updated_at = excluded.updated_at`
  );

  withTransaction(connection.driver, () => {
    if (shouldWriteActiveNodeMeta(connection, input.updatedAt)) {
      upsertMetaStatement.run([ACTIVE_NODE_META_KEY, input.activeNodeId ?? '', input.updatedAt]);
      writeActiveNodeViewStateSync(connection, {
        activeNodeId: input.activeNodeId,
        updatedAt: input.updatedAt
      });
    }
    saveNodeViewStates(connection, upsertNodeViewStateStatement, input, deviceId, source);
  });
}

function shouldWriteActiveNodeMeta(connection: DatabaseConnection, incomingUpdatedAt: string) {
  const incomingTime = Date.parse(incomingUpdatedAt);
  if (!Number.isFinite(incomingTime)) {
    return false;
  }
  const existing = connection.driver.queryOne<MetaRow>(
    'SELECT updated_at AS value FROM workspace_meta WHERE key = ?',
    [ACTIVE_NODE_META_KEY]
  );
  if (!existing) {
    return true;
  }
  const existingTime = Date.parse(existing.value);
  return !Number.isFinite(existingTime) || incomingTime >= existingTime;
}

function traceReadingProgressSave(input: SaveReadingProgressInput) {
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
}

function saveNodeViewStates(
  connection: DatabaseConnection,
  statement: DatabaseStatement,
  input: SaveReadingProgressInput,
  deviceId: string,
  source: NodeViewStateWriteSource
) {
  for (const state of input.nodeViewStates) {
    const existing = loadExistingNodeViewState(connection, deviceId, state.nodeId);
    const updatedAt = state.updatedAt?.trim() || existing?.updatedAt;
    if (!updatedAt) {
      continue;
    }
    const incoming: PersistedNodeViewState = { ...state, source, updatedAt };
    if (!shouldWritePersistedNodeViewState(existing, incoming).shouldWrite) {
      continue;
    }
    statement.run([
      state.nodeId,
      deviceId,
      state.scrollTop,
      state.selectionFrom,
      state.selectionTo,
      source,
      updatedAt
    ]);
    writeNodeViewStateSync(connection, { ...state, source, updatedAt });
  }
}

export function loadReadingProgress(): ReadingProgressSnapshot {
  const connection = openDatabaseConnection();
  const deviceId = loadDesktopDeviceId();
  const activeNodeRow = connection.driver.queryOne<MetaRow>(
    'SELECT value FROM workspace_meta WHERE key = ?',
    [ACTIVE_NODE_META_KEY]
  );
  const nodeRows = deviceId ? connection.driver.queryAll<NodeViewStateRow>(
    `SELECT
       node_id,
       scroll_top,
       selection_from,
       selection_to,
       source,
       updated_at
     FROM node_view_state
     WHERE device_id = ?`,
    [deviceId]
  ) : [];

  const nodeViewStateById: Record<string, NodeViewStateSnapshot> = {};
  for (const row of nodeRows) {
    nodeViewStateById[row.node_id] = {
      scrollTop: row.scroll_top,
      selectionFrom: row.selection_from,
      selectionTo: row.selection_to,
      source: normalizeNodeViewStateWriteSource(row.source),
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

function loadExistingNodeViewState(
  connection: DatabaseConnection,
  deviceId: string,
  nodeId: string
): PersistedNodeViewState | null {
  const row = connection.driver.queryOne<NodeViewStateRow>(
    `SELECT
       node_id,
       scroll_top,
       selection_from,
       selection_to,
       source,
       updated_at
     FROM node_view_state
     WHERE device_id = ? AND node_id = ?`,
    [deviceId, nodeId]
  );
  if (!row) {
    return null;
  }
  return {
    nodeId: row.node_id,
    scrollTop: row.scroll_top,
    selectionFrom: row.selection_from,
    selectionTo: row.selection_to,
    source: normalizeNodeViewStateWriteSource(row.source),
    updatedAt: row.updated_at
  };
}
