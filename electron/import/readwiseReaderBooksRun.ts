import path from 'node:path';

import type {
  ImportManagerSourceDraft,
  ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { readKeepImportItem, readKeepImportNodeState, upsertKeepImportItem } from '../database/keepImportItems.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { throwIfKeepImportAborted } from './keepImportProgress.js';
import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { refreshReadwiseBookPlaceholderNode } from './readwiseBookPlaceholderRefresh.js';
import type { ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { loadReadwiseBooksInventoryForPaths } from './readwiseBooksInventoryLoad.js';
import { savePersistedReadwiseBooksInventory } from './readwiseBooksInventoryState.js';

export type EnabledReadwiseBooksSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

type ReadwiseBook = ReadwiseBooksInventory['books'][number];
const INBOX_NODE_ID = 'special-inbox';

function isSameBook(left: ReadwiseBook, right: ReadwiseBook) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function countChangedBooks(
  inventory: ReadwiseBooksInventory,
  previous: ReadwiseBooksInventory | null
) {
  if (!previous) {
    return inventory.books.length;
  }
  const previousByKey = new Map(previous.books.map((book) => [book.bookKey, book]));
  return inventory.books.filter((book) => {
    const previousBook = previousByKey.get(book.bookKey);
    return !previousBook || !isSameBook(book, previousBook);
  }).length;
}

function upsertReadwiseBookPlaceholder(book: ReadwiseBook, updatedAt: string) {
  const nodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
  const updatedBook = {
    ...book,
    bodyState: 'unloaded',
    generatedNodeId: nodeId,
    importStatus: 'pending',
    nodeStatus: 'generated'
  } satisfies ReadwiseBook;

  upsertNodeSnapshot({
    anchorLink: null,
    content: buildReadwiseBookPlaceholderContent(updatedBook),
    createdAt: updatedAt,
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    openingText: null,
    parentNodeId: INBOX_NODE_ID,
    position: null,
    reveal: null,
    title: updatedBook.title,
    updatedAt
  });
  return updatedBook;
}

function resolveBookSourcePath(book: ReadwiseBook, inventory: ReadwiseBooksInventory) {
  const sourcePath = book.fullDocumentMarkdownPath
    ? path.relative(inventory.fullDocumentDirectoryPath, book.fullDocumentMarkdownPath)
    : book.highlightMarkdownPath
      ? path.relative(inventory.highlightDirectoryPath, book.highlightMarkdownPath)
      : `${book.title}.md`;
  return sourcePath.replace(/\\/g, '/');
}

function resolveBookSourceSignature(book: ReadwiseBook, inventory: ReadwiseBooksInventory, sourcePath: string) {
  const fullDocument = inventory.sourceSignature?.entries.find((entry) =>
    entry.sourceGroup === 'fullDocument' && entry.sourceName === sourcePath
  );
  const highlight = inventory.sourceSignature?.entries.find((entry) =>
    entry.sourceGroup === 'highlight' && entry.sourceName === sourcePath
  );
  return {
    highlight,
    primary: fullDocument ?? highlight
  };
}

function isBlockedReadwiseBookSource(ruleId: string, sourcePath: string) {
  const existingItem = readKeepImportItem(ruleId, sourcePath);
  if (!existingItem?.last_node_id) {
    return { blocked: false, existingItem };
  }
  const nodeState = readKeepImportNodeState(existingItem.last_node_id);
  return {
    blocked: !nodeState || nodeState.deleted_at !== null,
    existingItem,
    nodeDeletedAt: nodeState?.deleted_at ?? existingItem.deleted_at
  };
}

function persistReadwiseBookSourceState(input: {
  book: ReadwiseBook;
  inventory: ReadwiseBooksInventory;
  nodeId: string | null;
  ruleId: string;
  sourcePath: string;
  status: 'blocked_deleted' | 'imported';
  updatedAt: string;
}) {
  const signature = resolveBookSourceSignature(input.book, input.inventory, input.sourcePath);
  upsertKeepImportItem({
    deletedAt: input.status === 'blocked_deleted' ? input.updatedAt : null,
    hasSourceUpdate: false,
    highlightSourceMtimeMs: signature.highlight?.mtimeMs ?? null,
    highlightSourceSizeBytes: signature.highlight?.sizeBytes ?? null,
    lastImportedAt: input.status === 'blocked_deleted' ? null : input.updatedAt,
    lastNodeId: input.nodeId,
    lastSeenAt: input.updatedAt,
    lastStatus: input.status,
    localNodeState: input.status === 'blocked_deleted' ? 'locally_deleted' : input.nodeId ? 'active' : 'not_imported',
    ruleId: input.ruleId,
    sourceMtimeMs: signature.primary?.mtimeMs ?? 0,
    sourcePath: input.sourcePath,
    sourceSizeBytes: signature.primary?.sizeBytes ?? 0
  });
}

function syncReadwiseBookPlaceholders(source: EnabledReadwiseBooksSource, inventory: ReadwiseBooksInventory) {
  const updatedAt = new Date().toISOString();
  let createdCount = 0;
  const books = inventory.books.map((book) => {
    const sourcePath = resolveBookSourcePath(book, inventory);
    const blockedState = isBlockedReadwiseBookSource(source.id, sourcePath);
    if (blockedState.blocked) {
      persistReadwiseBookSourceState({
        book,
        inventory,
        nodeId: blockedState.existingItem?.last_node_id ?? book.generatedNodeId,
        ruleId: source.id,
        sourcePath,
        status: 'blocked_deleted',
        updatedAt: blockedState.nodeDeletedAt ?? updatedAt
      });
      return book;
    }
    if (book.generatedNodeId) {
      if (book.importStatus === 'pending') {
        refreshReadwiseBookPlaceholderNode(book);
      }
      persistReadwiseBookSourceState({
        book,
        inventory,
        nodeId: book.generatedNodeId,
        ruleId: source.id,
        sourcePath,
        status: 'imported',
        updatedAt
      });
      return book;
    }
    createdCount += 1;
    const updatedBook = upsertReadwiseBookPlaceholder(book, updatedAt);
    persistReadwiseBookSourceState({
      book: updatedBook,
      inventory,
      nodeId: updatedBook.generatedNodeId,
      ruleId: source.id,
      sourcePath,
      status: 'imported',
      updatedAt
    });
    return updatedBook;
  });
  const updatedInventory = createdCount > 0 ? { ...inventory, books, scannedAt: updatedAt } : inventory;
  if (createdCount > 0) {
    savePersistedReadwiseBooksInventory(updatedInventory);
  }
  return { createdCount, inventory: updatedInventory };
}

export async function runReadwiseBooksSource(
  source: EnabledReadwiseBooksSource,
  readwiseConfig: ReadwiseReaderConfig,
  options?: { forceScan?: boolean; signal?: AbortSignal }
) {
  throwIfKeepImportAborted(options?.signal);
  const paths = {
    fullDocumentDirectoryPath: source.primaryPath,
    highlightDirectoryPath: source.highlightPath
  };
  const result = await loadReadwiseBooksInventoryForPaths({
    ...(options?.forceScan === undefined ? {} : { forceScan: options.forceScan }),
    ...paths,
    readwiseConfig
  });
  throwIfKeepImportAborted(options?.signal);
  const synced = syncReadwiseBookPlaceholders(source, result.inventory);
  return {
    entryCount: synced.inventory.books.length,
    importedCount: result.sourceChanged
      ? countChangedBooks(synced.inventory, result.previousInventory)
      : synced.createdCount
  };
}
