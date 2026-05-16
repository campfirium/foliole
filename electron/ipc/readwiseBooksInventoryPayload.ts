import type { ReadwiseBookInventoryItem } from '../import/readwiseBooksInventory.js';
import { loadReadwiseBooksInventory } from '../import/readwiseBooksInventory.js';

function toNativeReadwiseBookInventoryItem(book: ReadwiseBookInventoryItem) {
  return {
    annotation_status: book.annotationStatus,
    body_state: book.bodyState,
    book_key: book.bookKey,
    epub_path: book.epubPath,
    epub_status: book.epubStatus,
    full_document_markdown_path: book.fullDocumentMarkdownPath,
    generated_node_id: book.generatedNodeId,
    highlight_state: book.highlightState,
    highlight_markdown_path: book.highlightMarkdownPath,
    highlight_unmatched_count: book.highlightUnmatchedCount,
    import_status: book.importStatus,
    node_status: book.nodeStatus,
    title: book.title
  };
}

export async function toNativeReadwiseBooksInventory() {
  const inventory = await loadReadwiseBooksInventory();
  return {
    books: inventory.books.map(toNativeReadwiseBookInventoryItem),
    full_document_directory_path: inventory.fullDocumentDirectoryPath,
    highlight_directory_path: inventory.highlightDirectoryPath,
    scanned_at: inventory.scannedAt
  };
}
