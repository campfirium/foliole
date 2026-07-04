import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { resolveDefaultImportRoot } from '../../lib/platform/libraryPaths.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

const INBOX_NODE_ID = 'special-inbox';

interface FolderRow {
  [column: string]: unknown;
  id: string;
}

function isInsideRoot(rootPath: string, filePath: string) {
  const relativePath = path.relative(rootPath, filePath);
  return relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function splitRelativeFolderPath(relativeFolderPath: string) {
  if (relativeFolderPath === '.') {
    return [];
  }
  return relativeFolderPath.split(/[\\/]+/).map((segment) => segment.trim()).filter(Boolean);
}

function findExistingFolder(parentNodeId: string | null, title: string) {
  return openDatabaseConnection().driver.queryOne<FolderRow>(
    `SELECT id
     FROM nodes
     WHERE deleted_at IS NULL
       AND kind = 'folder'
       AND title = ? COLLATE NOCASE
       AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
     ORDER BY created_at ASC
     LIMIT 1`,
    [title, parentNodeId, parentNodeId]
  );
}

function createFolder(parentNodeId: string | null, title: string, createdAt: string) {
  const nodeId = `node-${randomUUID()}`;
  upsertNodeSnapshot({
    anchorLink: null,
    content: '',
    createdAt,
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'folder',
    manualChildOrder: null,
    nodeId,
    openingText: null,
    parentNodeId,
    position: null,
    reveal: null,
    title,
    updatedAt: createdAt
  });
  return nodeId;
}

function ensureFolder(parentNodeId: string | null, title: string, createdAt: string) {
  return findExistingFolder(parentNodeId, title)?.id ?? createFolder(parentNodeId, title, createdAt);
}

function ensureInboxFolder(createdAt: string) {
  const existingInbox = openDatabaseConnection().driver.queryOne<FolderRow>(
    'SELECT id FROM nodes WHERE id = ?',
    [INBOX_NODE_ID]
  );
  if (existingInbox) {
    return INBOX_NODE_ID;
  }
  upsertNodeSnapshot({
    anchorLink: null,
    content: '',
    createdAt,
    hideTitleHeading: false,
    imageRegions: null,
    isTitleManual: true,
    kind: 'folder',
    manualChildOrder: null,
    nodeId: INBOX_NODE_ID,
    openingText: null,
    parentNodeId: null,
    position: null,
    reveal: null,
    title: 'Inbox',
    updatedAt: createdAt
  });
  return INBOX_NODE_ID;
}

export function resolveImportRootPath(libraryHomePath: string) {
  return resolveDefaultImportRoot(libraryHomePath);
}

export function resolveManagedImportTargetParentNodeId(args: {
  filePath: string;
  importedAt: string;
  importRootPath: string;
}) {
  if (!isInsideRoot(args.importRootPath, args.filePath)) {
    return undefined;
  }
  const relativeFolderPath = path.dirname(path.relative(args.importRootPath, args.filePath));
  const segments = splitRelativeFolderPath(relativeFolderPath);
  if (segments.length === 0) {
    return ensureInboxFolder(args.importedAt);
  }
  let parentNodeId: string | null = null;
  const folderSegments = segments[0]?.toLowerCase() === 'inbox'
    ? segments.slice(1)
    : segments;
  if (folderSegments.length !== segments.length) {
    parentNodeId = ensureInboxFolder(args.importedAt);
  }
  for (const segment of folderSegments) {
    parentNodeId = ensureFolder(parentNodeId, segment, args.importedAt);
  }
  return parentNodeId ?? INBOX_NODE_ID;
}
