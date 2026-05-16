import type { ReadwiseBookInventoryItem, ReadwiseBooksInventory } from './readwiseBooksInventory.js';

export interface PersistedReadwiseBooksInventoryState {
  inventories: Record<string, ReadwiseBooksInventory>;
  version: number;
}

function isBookInventoryItem(value: unknown): value is ReadwiseBookInventoryItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ReadwiseBookInventoryItem>;
  return (
    typeof candidate.annotationStatus === 'string' &&
    (candidate.bodyState === undefined || candidate.bodyState === 'loaded' || candidate.bodyState === 'unloaded') &&
    typeof candidate.bookKey === 'string' &&
    (typeof candidate.downloadUrl === 'string' || candidate.downloadUrl === null) &&
    (typeof candidate.epubPath === 'string' || candidate.epubPath === null) &&
    typeof candidate.epubStatus === 'string' &&
    (typeof candidate.fullDocumentMarkdownPath === 'string' || candidate.fullDocumentMarkdownPath === null) &&
    (typeof candidate.generatedNodeId === 'string' || candidate.generatedNodeId === null) &&
    (
      candidate.highlightState === undefined ||
      candidate.highlightState === null ||
      candidate.highlightState === 'failed' ||
      candidate.highlightState === 'partial' ||
      candidate.highlightState === 'pending' ||
      candidate.highlightState === 'placed'
    ) &&
    (typeof candidate.highlightMarkdownPath === 'string' || candidate.highlightMarkdownPath === null) &&
    (
      candidate.highlightUnmatchedCount === undefined ||
      candidate.highlightUnmatchedCount === null ||
      typeof candidate.highlightUnmatchedCount === 'number'
    ) &&
    typeof candidate.importStatus === 'string' &&
    typeof candidate.nodeStatus === 'string' &&
    typeof candidate.title === 'string'
  );
}

function normalizeBookInventoryItem(book: ReadwiseBookInventoryItem): ReadwiseBookInventoryItem {
  return {
    ...book,
    bodyState: book.bodyState ?? (book.importStatus === 'completed' ? 'loaded' : 'unloaded'),
    highlightState: book.highlightState ?? (book.annotationStatus === 'has_highlights' ? 'pending' : null),
    highlightUnmatchedCount: book.highlightUnmatchedCount ?? null
  };
}

function normalizeInventory(value: unknown): ReadwiseBooksInventory | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ReadwiseBooksInventory>;
  if (
    typeof candidate.fullDocumentDirectoryPath !== 'string' ||
    typeof candidate.highlightDirectoryPath !== 'string' ||
    typeof candidate.scannedAt !== 'string' ||
    !Array.isArray(candidate.books)
  ) {
    return null;
  }
  return {
    books: candidate.books.filter(isBookInventoryItem).map(normalizeBookInventoryItem),
    fullDocumentDirectoryPath: candidate.fullDocumentDirectoryPath,
    highlightDirectoryPath: candidate.highlightDirectoryPath,
    scannedAt: candidate.scannedAt
  };
}

export function normalizePersistedReadwiseBooksInventoryState(
  value: unknown,
  version: number
): PersistedReadwiseBooksInventoryState {
  if (!value || typeof value !== 'object') {
    return { inventories: {}, version };
  }
  const candidate = value as Partial<PersistedReadwiseBooksInventoryState>;
  const inventories = Object.entries(candidate.inventories ?? {}).reduce<Record<string, ReadwiseBooksInventory>>(
    (accumulator, [key, inventory]) => {
      const normalized = normalizeInventory(inventory);
      if (normalized) {
        accumulator[key] = normalized;
      }
      return accumulator;
    },
    {}
  );
  return { inventories, version };
}
