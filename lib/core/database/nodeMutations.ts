import type { NodeKind } from '../nodes/nodeKind.js';
import type { VirtualNodeFilter } from '../nodes/virtualNodeFilter.js';
import { stringifyVirtualNodeFilter } from '../nodes/virtualNodeFilter.js';

import type { DatabaseBindParams, DatabaseDriver } from './driver.js';
import { bumpUntitledSequenceByParent } from './workspaceUntitledSequence.js';

const SPECIAL_ROOT_NODE_RECORDS = {
  'special-inbox': { title: 'Inbox' },
  'special-virtual-root': { title: 'Virtual Nodes' }
} as const;

interface NodeAnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    page: number;
    x: number;
    y: number;
  };
}

interface NodeReadingPayload {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

export interface UpsertNodeSnapshotInput {
  nodeId: string;
  parentNodeId: string | null;
  kind: NodeKind;
  priority?: number | null;
  desiredRetention?: number | null;
  title: string;
  isTitleManual: boolean;
  hideTitleHeading?: boolean;
  content: string;
  virtualFilter?: VirtualNodeFilter | null;
  reveal: string | null;
  anchorLink: NodeAnchorLinkPayload | null;
  reading?: NodeReadingPayload | null;
  position: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeleteNodesInput {
  nodeIds: string[];
  deletedAt: string;
}

export interface RestoreNodesInput {
  nodeIds: string[];
}

export interface DeleteNodesPermanentlyInput {
  nodeIds: string[];
  nodeOrder: string[];
}

function toAnchorLinkValue(anchorLink: NodeAnchorLinkPayload | null): string | null {
  return anchorLink ? JSON.stringify(anchorLink) : null;
}

function createUpsertNodeStatement(driver: DatabaseDriver) {
  return driver.prepare(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, virtual_filter, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       parent_id = excluded.parent_id,
       kind = excluded.kind,
       priority = excluded.priority,
       desired_retention = excluded.desired_retention,
       title = excluded.title,
       is_title_manual = excluded.is_title_manual,
       hide_title_heading = excluded.hide_title_heading,
       content = excluded.content,
       virtual_filter = excluded.virtual_filter,
       reveal = excluded.reveal,
       anchor_link = excluded.anchor_link,
       updated_at = excluded.updated_at,
       deleted_at = NULL`
  );
}

function createUpsertNodeOrderStatement(driver: DatabaseDriver) {
  return driver.prepare(
    `INSERT INTO node_order (node_id, position)
     VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`
  );
}

function createUpsertNodeReadingStatement(driver: DatabaseDriver) {
  return driver.prepare(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
       next_at, priority, reading_position, repetition_count, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       interval_duration_ms = excluded.interval_duration_ms,
       interval_growth_factor = excluded.interval_growth_factor,
       last_handled_at = excluded.last_handled_at,
       next_at = excluded.next_at,
       priority = excluded.priority,
       reading_position = excluded.reading_position,
       repetition_count = excluded.repetition_count,
       state = excluded.state`
  );
}

function writeNodeReadingSnapshot(
  input: UpsertNodeSnapshotInput,
  runUpsert: (params?: DatabaseBindParams) => void,
  runDelete: (params?: DatabaseBindParams) => void
) {
  if (!input.reading) {
    runDelete([input.nodeId]);
    return;
  }
  runUpsert([
    input.nodeId,
    input.reading.intervalDurationMs,
    input.reading.intervalGrowthFactor,
    input.reading.lastHandledAt,
    input.reading.nextAt,
    input.reading.priority,
    input.reading.readingPosition,
    input.reading.repetitionCount,
    input.reading.state
  ]);
}

function ensureSpecialRootNode(driver: DatabaseDriver, nodeId: keyof typeof SPECIAL_ROOT_NODE_RECORDS, updatedAt: string) {
  const existingNode = driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = ?', [nodeId]);
  if (existingNode) {
    return;
  }
  driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, virtual_filter, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, 'folder', NULL, NULL, ?, 1, 0, '', NULL, NULL, NULL, ?, ?, NULL)`,
    [nodeId, SPECIAL_ROOT_NODE_RECORDS[nodeId].title, updatedAt, updatedAt]
  );
}

function ensureSpecialRootNodesForInput(driver: DatabaseDriver, input: UpsertNodeSnapshotInput) {
  if (input.nodeId in SPECIAL_ROOT_NODE_RECORDS) {
    ensureSpecialRootNode(driver, input.nodeId as keyof typeof SPECIAL_ROOT_NODE_RECORDS, input.updatedAt);
  }
  if (input.parentNodeId && input.parentNodeId in SPECIAL_ROOT_NODE_RECORDS) {
    ensureSpecialRootNode(driver, input.parentNodeId as keyof typeof SPECIAL_ROOT_NODE_RECORDS, input.updatedAt);
  }
}

function ensureSpecialRootNodesForOrder(driver: DatabaseDriver, nodeIds: string[]) {
  const updatedAt = new Date().toISOString();
  for (const nodeId of nodeIds) {
    if (nodeId in SPECIAL_ROOT_NODE_RECORDS) {
      ensureSpecialRootNode(driver, nodeId as keyof typeof SPECIAL_ROOT_NODE_RECORDS, updatedAt);
    }
  }
}

export function upsertNodeSnapshot(driver: DatabaseDriver, input: UpsertNodeSnapshotInput): void {
  const upsertNodeStatement = createUpsertNodeStatement(driver);
  const upsertNodeOrderStatement = createUpsertNodeOrderStatement(driver);
  const upsertNodeReadingStatement = createUpsertNodeReadingStatement(driver);
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');

  driver.transaction(() => {
    ensureSpecialRootNodesForInput(driver, input);
    upsertNodeStatement.run([
      input.nodeId,
      input.parentNodeId,
      input.kind,
      input.priority ?? null,
      input.desiredRetention ?? null,
      input.title,
      input.isTitleManual ? 1 : 0,
      input.hideTitleHeading === true ? 1 : 0,
      input.content,
      stringifyVirtualNodeFilter(input.virtualFilter ?? null),
      input.reveal,
      toAnchorLinkValue(input.anchorLink),
      input.createdAt,
      input.updatedAt
    ]);
    if (typeof input.position === 'number') {
      upsertNodeOrderStatement.run([input.nodeId, input.position]);
    }
    writeNodeReadingSnapshot(input, upsertNodeReadingStatement.run, deleteNodeReadingStatement.run);
    bumpUntitledSequenceByParent(driver, {
      parentNodeId: input.parentNodeId,
      title: input.title,
      updatedAt: input.updatedAt
    });
  });
}

export function replaceNodeOrder(driver: DatabaseDriver, nodeIds: string[]): void {
  const deleteOrderStatement = driver.prepare('DELETE FROM node_order');
  const insertOrderStatement = driver.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');

  driver.transaction(() => {
    ensureSpecialRootNodesForOrder(driver, nodeIds);
    deleteOrderStatement.run();
    for (let index = 0; index < nodeIds.length; index += 1) {
      insertOrderStatement.run([nodeIds[index], index]);
    }
  });
}

export function clearNodeOrder(driver: DatabaseDriver): void {
  driver.execute('DELETE FROM node_order');
}

export function softDeleteNodes(driver: DatabaseDriver, input: SoftDeleteNodesInput): void {
  const setDeletedAtStatement = driver.prepare('UPDATE nodes SET deleted_at = ?, updated_at = ? WHERE id = ?');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      setDeletedAtStatement.run([input.deletedAt, input.deletedAt, nodeId]);
    }
  });
}

export function restoreNodes(driver: DatabaseDriver, input: RestoreNodesInput): void {
  const restoredAt = new Date().toISOString();
  const clearDeletedAtStatement = driver.prepare('UPDATE nodes SET deleted_at = NULL, updated_at = ? WHERE id = ?');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      clearDeletedAtStatement.run([restoredAt, nodeId]);
    }
  });
}

export function deleteNodesPermanently(driver: DatabaseDriver, input: DeleteNodesPermanentlyInput): void {
  const deleteReviewLogStatement = driver.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReviewStatement = driver.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReadingStatement = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeOrderStatement = driver.prepare('DELETE FROM node_order WHERE node_id = ?');
  const deleteNodeStatement = driver.prepare('DELETE FROM nodes WHERE id = ?');
  const clearOrderStatement = driver.prepare('DELETE FROM node_order');
  const insertOrderStatement = driver.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      deleteReviewLogStatement.run([nodeId]);
      deleteNodeReviewStatement.run([nodeId]);
      deleteNodeReadingStatement.run([nodeId]);
      deleteNodeOrderStatement.run([nodeId]);
    }
    for (const nodeId of [...input.nodeIds].reverse()) {
      deleteNodeStatement.run([nodeId]);
    }
    clearOrderStatement.run();
    for (let index = 0; index < input.nodeOrder.length; index += 1) {
      insertOrderStatement.run([input.nodeOrder[index], index]);
    }
  });
}
