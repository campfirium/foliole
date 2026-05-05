import { randomUUID } from 'node:crypto';

import type { PersistedImportRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';

const INBOX_NODE_ID = 'special-inbox';

interface ExistingInboxRow {
  [column: string]: unknown;
  id: string;
}

interface ExistingNodeRow {
  [column: string]: unknown;
  content: string;
  created_at: string;
  deleted_at: string | null;
  id: string;
  parent_id: string | null;
  position: number | null;
}

function ensureInboxNode(driver: DatabaseDriver, importedAt: string) {
  const existingInbox = driver.queryOne<ExistingInboxRow>('SELECT id FROM nodes WHERE id = ?', [INBOX_NODE_ID]);
  if (existingInbox) {
    return;
  }
  driver.execute(
    `INSERT INTO nodes (
       id, parent_id, priority, desired_retention, title, is_title_manual,
       content, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, NULL, NULL, 'Inbox', 1, '', NULL, NULL, ?, ?, NULL)`,
    [INBOX_NODE_ID, importedAt, importedAt]
  );
}

export function writeNewNode(input: {
  content: string;
  driver: DatabaseDriver;
  importedAt: string;
  nextInboxTopPosition: number;
  record: PersistedImportRecord;
}) {
  ensureInboxNode(input.driver, input.importedAt);
  const nodeId = `node-${randomUUID()}`;
  input.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, priority, desired_retention, title, is_title_manual,
       content, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, ?, NULL, NULL, ?, 1, ?, NULL, NULL, ?, ?, NULL)`,
    [nodeId, INBOX_NODE_ID, input.record.sourceName, input.content, input.importedAt, input.importedAt]
  );
  input.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [nodeId, input.nextInboxTopPosition]);
  return nodeId;
}

export function updateExistingNode(input: {
  content: string;
  driver: DatabaseDriver;
  existingNode: ExistingNodeRow;
  nextInboxTopPosition: number;
  nextNodePosition: number;
  record: PersistedImportRecord;
}) {
  input.driver.execute(
    `UPDATE nodes
     SET title = ?, is_title_manual = 1, content = ?, updated_at = ?, deleted_at = NULL
     WHERE id = ?`,
    [input.record.sourceName, input.content, input.record.importedAt, input.existingNode.id]
  );
  if (input.existingNode.parent_id === INBOX_NODE_ID) {
    if (typeof input.existingNode.position === 'number') {
      input.driver.execute('UPDATE node_order SET position = ? WHERE node_id = ?', [input.nextInboxTopPosition, input.existingNode.id]);
    } else {
      input.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [input.existingNode.id, input.nextInboxTopPosition]);
    }
    return input.existingNode.id;
  }
  if (typeof input.existingNode.position !== 'number') {
    input.driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', [input.existingNode.id, input.nextNodePosition]);
  }
  return input.existingNode.id;
}
