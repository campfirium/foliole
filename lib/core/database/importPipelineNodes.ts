import { randomUUID } from 'node:crypto';

import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import { isNodeTitleTruncated, NODE_TITLE_MAX_CHARS, normalizeNodeTitle } from '../nodes/nodeTitleBudget.js';

import type { DatabaseDriver } from './driver.js';
import { applyParentContentChange } from './parentContentMutation.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';
import { hashTextBody } from './textBodyHash.js';

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

function resolveNextImportedTitle(driver: DatabaseDriver, desiredTitle: string, reports?: string[]) {
  const base = normalizeNodeTitle(desiredTitle.trim() || 'Untitled');
  let candidate = base;
  let sequence = 1;
  while (driver.queryOne('SELECT id FROM nodes WHERE deleted_at IS NULL AND title = ?', [candidate])) {
    const suffix = ` ${++sequence}`;
    let prefix = '';
    let count = 0;
    for (const character of base) {
      if (++count > NODE_TITLE_MAX_CHARS - suffix.length) break;
      prefix += character;
    }
    if (isNodeTitleTruncated(`${base}${suffix}`)) reports?.push('Imported topic title was shortened to 100 characters.');
    candidate = `${prefix}${suffix}`;
  }
  return candidate;
}

function reportTitleShortening(title: string, reports?: string[]) {
  if (isNodeTitleTruncated(title)) reports?.push('Imported topic title was shortened to 100 characters.');
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
  targetParentNodeId?: string | null;
  title: string;
  budgetFailures?: string[];
}) {
  const parentNodeId = input.targetParentNodeId || INBOX_NODE_ID;
  if (parentNodeId === INBOX_NODE_ID) {
    ensureInboxNode(input.driver, input.importedAt);
  }
  const nodeId = `node-${randomUUID()}`;
  const resolvedTitle = resolveNextImportedTitle(input.driver, input.title, input.budgetFailures);
  reportTitleShortening(input.title, input.budgetFailures);
  const openingText = resolveNodeOpeningText(input.content, resolvedTitle);
  const bodyBlobHash = hashTextBody(input.content);
  input.driver.execute(
    `INSERT INTO nodes (
     id, parent_id, kind, priority, desired_retention, title, is_title_manual, hide_title_heading,
     content, body_blob_hash, opening_text, reveal, anchor_link, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'topic', NULL, NULL, ?, 1, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
    [
      nodeId,
      parentNodeId,
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
  budgetFailures?: string[];
}) {
  const stored = input.driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id = ?', [input.existingNode.id]);
  const title = stored?.title === input.title ? input.title : normalizeNodeTitle(input.title);
  if (title !== input.title) reportTitleShortening(input.title, input.budgetFailures);
  input.driver.execute(
    `UPDATE nodes
     SET kind = 'topic', title = ?, is_title_manual = 1, hide_title_heading = ?, updated_at = ?, deleted_at = NULL
     WHERE id = ?`,
    [
      title,
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
    title,
    updatedAt: input.importedAt
  });
  if (!contentChange.written) {
    enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [input.existingNode.id]);
  }
  return input.existingNode.id;
}
