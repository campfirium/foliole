import { afterEach, expect, it, vi } from 'vitest';

import { loadRuntimeReadwiseBooksInventory } from './readwiseBooksBridge';

function createMockElectronApi(invoke: ReturnType<typeof vi.fn>) {
  return {
    invoke,
    onManagedInboxUpdated: vi.fn(() => () => undefined),
    onNativeMenuCommand: vi.fn(() => () => undefined),
    onWindowResized: vi.fn(() => () => undefined)
  };
}

const READWISE_BOOKS_INVENTORY_PAYLOAD = {
  books: [
    {
      annotation_status: 'has_highlights',
      book_key: 'book-a',
      epub_path: '/tmp/Book A.epub',
      epub_status: 'received',
      full_document_markdown_path: '/tmp/Book A.md',
      generated_node_id: 'node-book-a',
      highlight_markdown_path: '/tmp/Book A Highlights.md',
      import_status: 'completed',
      node_status: 'generated',
      title: 'Book A'
    }
  ],
  full_document_directory_path: '/tmp/books',
  highlight_directory_path: '/tmp/highlights',
  scanned_at: '2026-04-03T10:00:00.000Z'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it('normalizes the readwise books inventory payload', async () => {
  const invoke = vi.fn().mockResolvedValue(READWISE_BOOKS_INVENTORY_PAYLOAD);
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeReadwiseBooksInventory()).resolves.toEqual({
    books: [
      {
        annotationStatus: 'has_highlights',
        bookKey: 'book-a',
        epubPath: '/tmp/Book A.epub',
        epubStatus: 'received',
        fullDocumentMarkdownPath: '/tmp/Book A.md',
        generatedNodeId: 'node-book-a',
        highlightMarkdownPath: '/tmp/Book A Highlights.md',
        importStatus: 'completed',
        nodeStatus: 'generated',
        title: 'Book A'
      }
    ],
    fullDocumentDirectoryPath: '/tmp/books',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T10:00:00.000Z'
  });
  expect(invoke).toHaveBeenCalledWith('load_readwise_books_inventory');
});

it('returns null when the readwise books inventory payload is malformed', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockResolvedValue({ books: [{}] });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeReadwiseBooksInventory()).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native readwise books inventory payload invalid',
    expect.objectContaining({
      action: 'load_runtime_readwise_books_inventory',
      area: 'bridge',
      command: 'load_readwise_books_inventory',
      fallback: 'return_null'
    })
  );
});
