import type { NativeReadwiseBookImportResetResult } from '../../lib/platform/nativeReadwiseContract.js';

import type { ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';

export function createReadwiseBookNotFoundResetResult(): NativeReadwiseBookImportResetResult {
  return {
    book_key: null,
    content: null,
    node_id: null,
    removed_node_ids: [],
    status: 'book_not_found',
    title: null,
    updated_at: null
  };
}

export function createInactiveSourceReadwiseBookResetResult(
  book: ReadwiseBookInventoryItem
): NativeReadwiseBookImportResetResult {
  return {
    book_key: book.bookKey,
    content: null,
    node_id: book.generatedNodeId ?? null,
    removed_node_ids: [],
    status: 'source_inactive',
    title: book.title,
    updated_at: null
  };
}
