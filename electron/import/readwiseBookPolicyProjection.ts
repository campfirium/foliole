import path from 'node:path';

import type { ImportManagerSourceDraft, ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseAutoImportDestination, type ReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { resolveImportedNodeIdForExternalDocument } from '../database/externalDocumentImportVisibility.js';
import { readKeepImportItem, readKeepImportNodeState, upsertKeepImportItem } from '../database/keepImportItems.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { hideReadwiseExternalDocument } from '../database/readwiseManagedExternalDocuments.js';

import { assertKeepImportSourceCanRun } from './keepImportExecutionGuard.js';
import { upsertReadwiseBookExternalProjection } from './readwiseBookExternalProjection.js';
import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { refreshReadwiseBookPlaceholderNode } from './readwiseBookPlaceholderRefresh.js';
import type { ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { savePersistedReadwiseBooksInventory } from './readwiseBooksInventoryState.js';

type EnabledBooksSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };
type ReadwiseBook = ReadwiseBooksInventory['books'][number];
const INBOX_NODE_ID = 'special-inbox';

function upsertPlaceholder(book: ReadwiseBook, updatedAt: string) {
  const nodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
  const updatedBook = {
    ...book, bodyState: 'unloaded', generatedNodeId: nodeId,
    importStatus: 'pending', nodeStatus: 'generated'
  } satisfies ReadwiseBook;
  upsertNodeSnapshot({
    anchorLink: null, content: buildReadwiseBookPlaceholderContent(updatedBook),
    createdAt: updatedAt, hideTitleHeading: false, isTitleManual: true, kind: 'topic',
    nodeId, openingText: null, parentNodeId: INBOX_NODE_ID, position: null, reveal: null,
    title: updatedBook.title, updatedAt
  });
  return updatedBook;
}

function resolveSourcePath(book: ReadwiseBook, inventory: ReadwiseBooksInventory) {
  const sourcePath = book.fullDocumentMarkdownPath
    ? path.relative(inventory.fullDocumentDirectoryPath, book.fullDocumentMarkdownPath)
    : book.highlightMarkdownPath
      ? path.relative(inventory.highlightDirectoryPath, book.highlightMarkdownPath)
      : `${book.title}.md`;
  return sourcePath.replace(/\\/g, '/');
}

function resolveSignature(book: ReadwiseBook, inventory: ReadwiseBooksInventory, sourcePath: string) {
  const entry = (sourceGroup: 'fullDocument' | 'highlight') =>
    inventory.sourceSignature?.entries.find((item) =>
      item.sourceGroup === sourceGroup && item.sourceName === sourcePath);
  return { highlight: entry('highlight'), primary: entry('fullDocument') ?? entry('highlight') };
}

function blockedState(ruleId: string, sourcePath: string) {
  const existingItem = readKeepImportItem(ruleId, sourcePath);
  if (!existingItem?.last_node_id) return { blocked: false, existingItem };
  const nodeState = readKeepImportNodeState(existingItem.last_node_id);
  return {
    blocked: !nodeState || nodeState.deleted_at !== null,
    existingItem,
    nodeDeletedAt: nodeState?.deleted_at ?? existingItem.deleted_at
  };
}

function adoptedNodeId(book: ReadwiseBook) {
  const sourcePath = book.fullDocumentMarkdownPath ?? book.highlightMarkdownPath;
  if (!sourcePath) return null;
  const nodeId = resolveImportedNodeIdForExternalDocument(sourcePath);
  return nodeId && readKeepImportNodeState(nodeId)?.deleted_at === null ? nodeId : null;
}

function adoptedBook(book: ReadwiseBook, nodeId: string) {
  return {
    ...book, bodyState: 'loaded', generatedNodeId: nodeId,
    importStatus: 'completed', nodeStatus: 'generated'
  } satisfies ReadwiseBook;
}

function persist(input: {
  book: ReadwiseBook;
  inventory: ReadwiseBooksInventory;
  nodeId: string | null;
  ruleId: string;
  sourcePath: string;
  status: 'blocked_deleted' | 'discovered' | 'imported';
  updatedAt: string;
}) {
  const signature = resolveSignature(input.book, input.inventory, input.sourcePath);
  upsertKeepImportItem({
    deletedAt: input.status === 'blocked_deleted' ? input.updatedAt : null,
    hasSourceUpdate: false,
    highlightSourceMtimeMs: signature.highlight?.mtimeMs ?? null,
    highlightSourceSizeBytes: signature.highlight?.sizeBytes ?? null,
    lastImportedAt: input.status === 'imported' ? input.updatedAt : null,
    lastNodeId: input.nodeId, lastSeenAt: input.updatedAt, lastStatus: input.status,
    localNodeState: input.status === 'blocked_deleted'
      ? 'locally_deleted' : input.nodeId ? 'active' : 'not_imported',
    ruleId: input.ruleId, sourceMtimeMs: signature.primary?.mtimeMs ?? 0,
    sourcePath: input.sourcePath, sourceSizeBytes: signature.primary?.sizeBytes ?? 0
  });
}

async function projectBook(input: {
  book: ReadwiseBook;
  inventory: ReadwiseBooksInventory;
  policy: ReadwiseAutoImportPolicy;
  source: EnabledBooksSource;
  updatedAt: string;
}) {
  const { book, inventory, policy, source, updatedAt } = input;
  assertKeepImportSourceCanRun({
    directoryPath: source.primaryPath, ruleId: source.id, sourceType: 'readwise'
  });
  const sourcePath = resolveSourcePath(book, inventory);
  const blocked = blockedState(source.id, sourcePath);
  if (blocked.blocked) {
    persist({
      book, inventory, nodeId: blocked.existingItem?.last_node_id ?? book.generatedNodeId,
      ruleId: source.id, sourcePath, status: 'blocked_deleted',
      updatedAt: blocked.nodeDeletedAt ?? updatedAt
    });
    return { book, created: false, inventoryChanged: false };
  }
  const adoptedId = adoptedNodeId(book);
  if (adoptedId && book.importStatus !== 'completed') {
    const next = adoptedBook(book, adoptedId);
    hideReadwiseExternalDocument('books', sourcePath, updatedAt);
    persist({ book: next, inventory, nodeId: adoptedId, ruleId: source.id, sourcePath,
      status: 'imported', updatedAt });
    return { book: next, created: false, inventoryChanged: true };
  }
  if (book.generatedNodeId && readKeepImportNodeState(book.generatedNodeId)?.deleted_at === null) {
    hideReadwiseExternalDocument('books', sourcePath, updatedAt);
  } else {
    const destination = resolveReadwiseAutoImportDestination(policy, 'book', book.highlightCount > 0);
    if (destination !== 'inbox') {
      if (destination === 'external') {
        const sourceSignature = resolveSignature(book, inventory, sourcePath).primary;
        await upsertReadwiseBookExternalProjection({
          book, indexedAt: updatedAt, inventory, sourceName: sourcePath,
          ...(sourceSignature ? { sourceSignature } : {})
        });
      } else hideReadwiseExternalDocument('books', sourcePath, updatedAt);
      persist({ book, inventory, nodeId: null, ruleId: source.id, sourcePath,
        status: destination === 'external' ? 'imported' : 'discovered', updatedAt });
      return { book, created: false, inventoryChanged: false };
    }
  }
  if (book.generatedNodeId) {
    if (book.importStatus === 'pending') refreshReadwiseBookPlaceholderNode(book);
    persist({ book, inventory, nodeId: book.generatedNodeId, ruleId: source.id, sourcePath,
      status: 'imported', updatedAt });
    return { book, created: false, inventoryChanged: false };
  }
  hideReadwiseExternalDocument('books', sourcePath, updatedAt);
  const next = upsertPlaceholder(book, updatedAt);
  persist({ book: next, inventory, nodeId: next.generatedNodeId, ruleId: source.id,
    sourcePath, status: 'imported', updatedAt });
  return { book: next, created: true, inventoryChanged: true };
}

export async function syncReadwiseBookPolicyProjection(
  source: EnabledBooksSource,
  inventory: ReadwiseBooksInventory,
  policy: ReadwiseAutoImportPolicy
) {
  const updatedAt = new Date().toISOString();
  const projected = await Promise.all(inventory.books.map((book) =>
    projectBook({ book, inventory, policy, source, updatedAt })));
  const books = projected.map((item) => item.book);
  const createdCount = projected.filter((item) => item.created).length;
  const inventoryChanged = projected.some((item) => item.inventoryChanged);
  const updatedInventory = createdCount > 0 || inventoryChanged
    ? { ...inventory, books, scannedAt: updatedAt }
    : inventory;
  if (createdCount > 0 || inventoryChanged) savePersistedReadwiseBooksInventory(updatedInventory);
  return { createdCount, inventory: updatedInventory };
}
