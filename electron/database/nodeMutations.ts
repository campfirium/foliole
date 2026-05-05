import { openDatabaseConnection } from './connection.js';
import { withTransaction } from './transaction.js';

interface NodeAnchorLinkPayload {
  id: string;
  kind: 'highlight' | 'cloze';
}

export interface UpsertNodeSnapshotInput {
  nodeId: string;
  parentNodeId: string | null;
  title: string;
  isTitleManual: boolean;
  content: string;
  reveal: string | null;
  anchorLink: NodeAnchorLinkPayload | null;
  position: number | null;
  createdAt: string;
  updatedAt: string;
}

function toAnchorLinkValue(anchorLink: NodeAnchorLinkPayload | null): string | null {
  return anchorLink ? JSON.stringify(anchorLink) : null;
}

export function upsertNodeSnapshot(input: UpsertNodeSnapshotInput): void {
  const connection = openDatabaseConnection();
  const upsertNodeStatement = connection.sqlite.prepare(
    `INSERT INTO nodes (
        id,
        parent_id,
        title,
        is_title_manual,
        content,
        reveal,
        anchor_link,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        parent_id = excluded.parent_id,
        title = excluded.title,
        is_title_manual = excluded.is_title_manual,
        content = excluded.content,
        reveal = excluded.reveal,
        anchor_link = excluded.anchor_link,
        updated_at = excluded.updated_at,
        deleted_at = NULL`
  );
  const upsertNodeOrderStatement = connection.sqlite.prepare(
    `INSERT INTO node_order (node_id, position)
     VALUES (?, ?)
     ON CONFLICT(node_id) DO UPDATE SET position = excluded.position`
  );
  withTransaction(connection.sqlite, () => {
    upsertNodeStatement.run(
      input.nodeId,
      input.parentNodeId,
      input.title,
      input.isTitleManual ? 1 : 0,
      input.content,
      input.reveal,
      toAnchorLinkValue(input.anchorLink),
      input.createdAt,
      input.updatedAt
    );
    if (typeof input.position === 'number') {
      upsertNodeOrderStatement.run(input.nodeId, input.position);
    }
  });
}

export function replaceNodeOrder(nodeIds: string[]): void {
  const connection = openDatabaseConnection();
  const deleteOrderStatement = connection.sqlite.prepare('DELETE FROM node_order');
  const insertOrderStatement = connection.sqlite.prepare(
    'INSERT INTO node_order (node_id, position) VALUES (?, ?)'
  );
  withTransaction(connection.sqlite, () => {
    deleteOrderStatement.run();
    for (let index = 0; index < nodeIds.length; index += 1) {
      insertOrderStatement.run(nodeIds[index], index);
    }
  });
}

export function clearNodeOrder(): void {
  const connection = openDatabaseConnection();
  connection.sqlite.prepare('DELETE FROM node_order').run();
}
