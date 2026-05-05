import type { DatabaseDriver } from './driver.js';

interface NodeAnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
}

export interface UpsertNodeSnapshotInput {
  nodeId: string;
  parentNodeId: string | null;
  priority?: number | null;
  desiredRetention?: number | null;
  title: string;
  isTitleManual: boolean;
  content: string;
  reveal: string | null;
  anchorLink: NodeAnchorLinkPayload | null;
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

export function upsertNodeSnapshot(driver: DatabaseDriver, input: UpsertNodeSnapshotInput): void {
  const upsertNodeStatement = driver.prepare(
    `INSERT INTO nodes (
        id,
        parent_id,
        priority,
        desired_retention,
        title,
        is_title_manual,
        content,
        reveal,
        anchor_link,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        parent_id = excluded.parent_id,
        priority = excluded.priority,
        desired_retention = excluded.desired_retention,
        title = excluded.title,
        is_title_manual = excluded.is_title_manual,
        content = excluded.content,
        reveal = excluded.reveal,
        anchor_link = excluded.anchor_link,
        updated_at = excluded.updated_at,
        deleted_at = NULL`
  );
  const upsertNodeOrderStatement = driver.prepare(
    `INSERT INTO node_order (node_id, position)
     VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`
  );

  driver.transaction(() => {
    upsertNodeStatement.run([
      input.nodeId,
      input.parentNodeId,
      input.priority ?? null,
      input.desiredRetention ?? null,
      input.title,
      input.isTitleManual ? 1 : 0,
      input.content,
      input.reveal,
      toAnchorLinkValue(input.anchorLink),
      input.createdAt,
      input.updatedAt
    ]);
    if (typeof input.position === 'number') {
      upsertNodeOrderStatement.run([input.nodeId, input.position]);
    }
  });
}

export function replaceNodeOrder(driver: DatabaseDriver, nodeIds: string[]): void {
  const deleteOrderStatement = driver.prepare('DELETE FROM node_order');
  const insertOrderStatement = driver.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');

  driver.transaction(() => {
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
  const deleteNodeOrderStatement = driver.prepare('DELETE FROM node_order WHERE node_id = ?');
  const deleteNodeStatement = driver.prepare('DELETE FROM nodes WHERE id = ?');
  const clearOrderStatement = driver.prepare('DELETE FROM node_order');
  const insertOrderStatement = driver.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');

  driver.transaction(() => {
    for (const nodeId of input.nodeIds) {
      deleteReviewLogStatement.run([nodeId]);
      deleteNodeReviewStatement.run([nodeId]);
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
