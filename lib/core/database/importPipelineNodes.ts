import { randomUUID } from 'node:crypto';

import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';

import { upsertTextBodyBlob } from './contentBodyBlobs.js';
import type { DatabaseDriver } from './driver.js';
import { applyParentContentChange } from './parentContentMutation.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

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
}

function escapeLikePattern(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function resolveNextImportedTitle(driver: DatabaseDriver, desiredTitle: string) {
  const trimmedTitle = desiredTitle.trim() || 'Untitled';
  const duplicateRows = driver.queryAll<{ title: string }>(
    `SELECT title
     FROM nodes
     WHERE deleted_at IS NULL
       AND (title = ? OR title LIKE ? ESCAPE '\\')`,
    [trimmedTitle, `${escapeLikePattern(trimmedTitle)} %`]
  );
  const occupiedTitles = new Set(duplicateRows.map((row) => row.title));
  if (!occupiedTitles.has(trimmedTitle)) {
    return trimmedTitle;
  }

  let suffix = 2;
  while (occupiedTitles.has(`${trimmedTitle} ${suffix}`)) {
    suffix += 1;
  }
  return `${trimmedTitle} ${suffix}`;
}

function ensureInboxNode(driver: DatabaseDriver, importedAt: string) {
  const existingInbox = driver.queryOne<ExistingInboxRow>('SELECT id FROM nodes WHERE id = ?', [INBOX_NODE_ID]);
  if (existingInbox) {
    return;
  }
  driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
       content, opening_text, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, NULL, 'folder', NULL, NULL, 'Inbox', 1, 0, '', NULL, NULL, NULL, ?, ?, NULL)`,
    [INBOX_NODE_ID, importedAt, importedAt]
  );
}

export function writeNewNode(input: {
  content: string;
  driver: DatabaseDriver;
  hideTitleHeading: boolean;
  importedAt: string;
  title: string;
}) {
  ensureInboxNode(input.driver, input.importedAt);
  const nodeId = `node-${randomUUID()}`;
  const resolvedTitle = resolveNextImportedTitle(input.driver, input.title);
  const openingText = resolveNodeOpeningText(input.content, resolvedTitle);
  const bodyBlobHash = upsertTextBodyBlob(input.driver, input.content, input.importedAt);
  input.driver.execute(
    `INSERT INTO nodes (
     id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
     content, body_blob_hash, opening_text, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, ?, 1, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
    [
      nodeId,
      INBOX_NODE_ID,
      resolvedTitle,
      input.hideTitleHeading ? 1 : 0,
      input.content,
      bodyBlobHash,
      openingText,
      input.importedAt,
      input.importedAt
    ]
  );
  enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [nodeId]);
  return nodeId;
}

export function updateExistingNode(input: {
  content: string;
  driver: DatabaseDriver;
  existingNode: ExistingNodeRow;
  hideTitleHeading: boolean;
  importedAt: string;
  title: string;
}) {
  input.driver.execute(
    `UPDATE nodes
     SET kind = 'topic', title = ?, is_title_manual = 1, hide_title_heading = ?, updated_at = ?, deleted_at = NULL
     WHERE id = ?`,
    [
      input.title,
      input.hideTitleHeading ? 1 : 0,
      input.importedAt,
      input.existingNode.id
    ]
  );
  const contentChange = applyParentContentChange({
    driver: input.driver,
    nextContent: input.content,
    nodeId: input.existingNode.id,
    previousContent: input.existingNode.content,
    title: input.title,
    updatedAt: input.importedAt
  });
  if (!contentChange.written) {
    enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [input.existingNode.id]);
  }
  return input.existingNode.id;
}
