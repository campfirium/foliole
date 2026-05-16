import { afterEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../lib/platform/nativeContract';

import { loadRuntimeReadwiseBooksInventoryResult } from './readwiseBooksInventoryLoadResult';
import { loadRuntimeReadwiseBooksInventory, onRuntimeReadwiseBookEpubProgress } from './readwiseBooksRuntimeRepository';

function createMockElectronApi(invoke: NativeInvoke) {
  return {
    invoke,
    onManagedInboxUpdated: vi.fn(() => () => undefined),
    onNativeMenuCommand: vi.fn(() => () => undefined),
    onReadwiseBookEpubProgress: vi.fn(() => () => undefined),
    onWindowResized: vi.fn(() => () => undefined)
  };
}

const READWISE_BOOKS_INVENTORY_PAYLOAD = {
  books: [
    {
      annotation_status: 'has_highlights',
      body_state: 'loaded',
      book_key: 'book-a',
      epub_path: '/tmp/Book A.epub',
      epub_status: 'received',
      full_document_markdown_path: '/tmp/Book A.md',
      generated_node_id: 'node-book-a',
      highlight_state: 'placed',
      highlight_markdown_path: '/tmp/Book A Highlights.md',
      highlight_unmatched_count: 0,
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('normalizes the readwise books inventory payload', async () => {
  const invoke = vi.fn().mockResolvedValue(READWISE_BOOKS_INVENTORY_PAYLOAD);
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeReadwiseBooksInventory()).resolves.toEqual({
    books: [
      {
        annotationStatus: 'has_highlights',
        bodyState: 'loaded',
        bookKey: 'book-a',
        epubPath: '/tmp/Book A.epub',
        epubStatus: 'received',
        fullDocumentMarkdownPath: '/tmp/Book A.md',
        generatedNodeId: 'node-book-a',
        highlightState: 'placed',
        highlightMarkdownPath: '/tmp/Book A Highlights.md',
        highlightUnmatchedCount: 0,
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

it('rejects readwise books inventory items without body state', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockResolvedValue({
    ...READWISE_BOOKS_INVENTORY_PAYLOAD,
    books: [
      {
        ...READWISE_BOOKS_INVENTORY_PAYLOAD.books[0],
        body_state: undefined
      }
    ]
  });
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

it('rejects malformed readwise books highlight state', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockResolvedValue({
    ...READWISE_BOOKS_INVENTORY_PAYLOAD,
    books: [
      {
        ...READWISE_BOOKS_INVENTORY_PAYLOAD.books[0],
        highlight_state: 'missing'
      }
    ]
  });
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

it('returns unavailable when the readwise books inventory runtime is missing', async () => {
  delete window.electronAPI;

  await expect(loadRuntimeReadwiseBooksInventoryResult()).resolves.toEqual({ status: 'unavailable' });
});

it('returns failed when the readwise books inventory payload is malformed', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockResolvedValue({ books: [{}] });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeReadwiseBooksInventoryResult()).resolves.toEqual({
    message: 'Readwise Books inventory could not be loaded.',
    status: 'failed'
  });
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native inventory payload invalid',
    expect.objectContaining({
      action: 'load_runtime_readwise_books_inventory',
      area: 'bridge',
      command: 'load_readwise_books_inventory',
      fallback: 'return_failed'
    })
  );
});

it('returns failed with the thrown message when readwise books inventory loading rejects', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockRejectedValue(new Error('database is locked'));
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeReadwiseBooksInventoryResult()).resolves.toEqual({
    message: 'database is locked',
    status: 'failed'
  });
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native inventory loading failed',
    expect.objectContaining({
      action: 'load_runtime_readwise_books_inventory',
      area: 'bridge',
      command: 'load_readwise_books_inventory',
      fallback: 'return_failed'
    })
  );
});

it('normalizes readwise book epub progress events', () => {
  const onReadwiseBookEpubProgress = vi.fn(
    (handler: (payload: { detail: string; nodeId: string; phase: string; progress: number }) => void) => {
    handler({
      detail: 'Placing highlights…',
      nodeId: 'node-book-a',
      phase: 'placing_highlights',
      progress: 0.8
    });
    return () => undefined;
    }
  );
  window.electronAPI = {
    ...createMockElectronApi(vi.fn()),
    onReadwiseBookEpubProgress
  };
  const handler = vi.fn();

  onRuntimeReadwiseBookEpubProgress(handler);

  expect(handler).toHaveBeenCalledWith({
    detail: 'Placing highlights…',
    nodeId: 'node-book-a',
    phase: 'placing_highlights',
    progress: 0.8
  });
});
