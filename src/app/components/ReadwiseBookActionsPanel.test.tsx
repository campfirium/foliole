import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from '../../store/workspaceStore';

const {
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  onRuntimeReadwiseBookEpubProgress,
  openRuntimeReadwiseBookDownload
} = vi.hoisted(() => ({
  loadRuntimeReadwiseBookEpub: vi.fn(),
  loadRuntimeReadwiseBooksInventory: vi.fn(),
  onRuntimeReadwiseBookEpubProgress: vi.fn(),
  openRuntimeReadwiseBookDownload: vi.fn()
}));

vi.mock('../../shared/platform/readwiseBooksRuntimeRepository', () => ({
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  onRuntimeReadwiseBookEpubProgress,
  openRuntimeReadwiseBookDownload
}));

import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';
import { READWISE_ORIGINAL_FILE_LOADED_EVENT } from './readwiseBookActionState';
import { ReadwiseBookDocumentGate } from './ReadwiseBookDocumentGate';

function createPendingBook() {
  return {
    annotationStatus: 'has_highlights' as const,
    bodyState: 'unloaded' as const,
    bookKey: 'book-1',
    epubPath: null,
    epubStatus: 'missing' as const,
    fullDocumentMarkdownPath: '/tmp/book-1.md',
    generatedNodeId: 'node-book-1',
    highlightMarkdownPath: '/tmp/book-1-highlights.md',
    highlightState: 'placed' as const,
    highlightUnmatchedCount: 0,
    importStatus: 'pending' as const,
    nodeStatus: 'generated' as const,
    title: 'Book One'
  };
}

function seedDefaultRuntime() {
  loadRuntimeReadwiseBooksInventory.mockResolvedValue({
    books: [createPendingBook()],
    fullDocumentDirectoryPath: '/tmp/full',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T00:00:00.000Z'
  });
  openRuntimeReadwiseBookDownload.mockResolvedValue({ book_key: 'book-1', status: 'opened', title: 'Book One' });
  loadRuntimeReadwiseBookEpub.mockResolvedValue({
    book_key: 'book-1',
    epub_path: '/tmp/book-1.epub',
    status: 'selected',
    title: 'Book One'
  });
  onRuntimeReadwiseBookEpubProgress.mockReturnValue(() => undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();
  seedDefaultRuntime();
});

describe('ReadwiseBookActionsPanel', () => {
  it('renders the original file panel while the file has not been loaded', async () => {
    render(
      <ReadwiseBookActionsPanel activeContent="" activeNodeId="node-book-1">
        <div>Editor body</div>
      </ReadwiseBookActionsPanel>
    );

    expect(await screen.findByText('Original file')).toBeInTheDocument();
    expect(screen.getByText('Editor body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download original file' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load original file' })).toBeInTheDocument();
  });

  it('keeps the document body visible for pending books', async () => {
    render(
      <ReadwiseBookDocumentGate activeContent="" activeNodeId="node-book-1">
        <div>Book placeholder body</div>
      </ReadwiseBookDocumentGate>
    );

    expect(await screen.findByText('Book placeholder body')).toBeInTheDocument();
  });

  it('runs download actions from the panel', async () => {
    render(<ReadwiseBookActionsPanel activeContent="" activeNodeId="node-book-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Download original file' }));

    await waitFor(() => expect(openRuntimeReadwiseBookDownload).toHaveBeenCalledWith('node-book-1'));
  });

  it('loads the original file and asks source details to refresh', async () => {
    const loadedListener = vi.fn();
    window.addEventListener(READWISE_ORIGINAL_FILE_LOADED_EVENT, loadedListener);

    render(<ReadwiseBookActionsPanel activeContent="" activeNodeId="node-book-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Load original file' }));

    await waitFor(() => expect(loadRuntimeReadwiseBookEpub).toHaveBeenCalledWith('node-book-1'));
    expect(useWorkspaceStore.persist.rehydrate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(loadedListener).toHaveBeenCalledTimes(1));
    window.removeEventListener(READWISE_ORIGINAL_FILE_LOADED_EVENT, loadedListener);
  });
});
