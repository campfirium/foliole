import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function seedDefaultInventory() {
  loadRuntimeReadwiseBooksInventory.mockResolvedValue({
    books: [
      {
        annotationStatus: 'has_highlights',
        bookKey: 'book-1',
        epubPath: null,
        epubStatus: 'missing',
        generatedNodeId: 'node-book-1',
        highlightMarkdownPath: '/tmp/book-1.md',
        importStatus: 'pending',
        nodeStatus: 'generated',
        title: 'Book One'
      }
    ],
    scannedAt: '2026-04-03T00:00:00.000Z'
  });
}

function renderBookActionsPanel(activeNodeId: string) {
  render(<ReadwiseBookActionsPanel activeNodeId={activeNodeId} />);
}

function setupReadwiseBookActionsPanelMocks() {
  vi.clearAllMocks();
  vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue();
  seedDefaultInventory();
  openRuntimeReadwiseBookDownload.mockResolvedValue({
    book_key: 'book-1',
    status: 'opened',
    title: 'Book One',
    url: 'https://example.com/book-1.epub'
  });
  onRuntimeReadwiseBookEpubProgress.mockReturnValue(() => undefined);
  loadRuntimeReadwiseBookEpub.mockResolvedValue({
    book_key: 'book-1',
    epub_path: '/tmp/book-1.epub',
    status: 'selected',
    title: 'Book One'
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReadwiseBookActionsPanel actions', () => {
  beforeEach(() => {
    setupReadwiseBookActionsPanelMocks();
  });

  it('renders manual EPUB actions for the matching book node', async () => {
    renderBookActionsPanel('node-book-1');

    expect(await screen.findByRole('button', { name: 'Download EPUB' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load EPUB' })).toBeInTheDocument();
    expect(screen.getByText('No EPUB has been loaded for this book yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download EPUB' }));

    await waitFor(() => {
      expect(openRuntimeReadwiseBookDownload).toHaveBeenCalledWith('node-book-1');
    });
    expect(await screen.findByText('Opened the EPUB download for Book One.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load EPUB' }));

    await waitFor(() => {
      expect(loadRuntimeReadwiseBookEpub).toHaveBeenCalledWith('node-book-1');
    });
    expect(useWorkspaceStore.persist.rehydrate).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Download EPUB' })).not.toBeInTheDocument();
    });
  });

  it('resets the loading state and shows a failure message when epub loading fails', async () => {
    loadRuntimeReadwiseBookEpub.mockResolvedValue({
      book_key: 'book-1',
      error_message: 'Could not load this EPUB. Please try another file.',
      epub_path: null,
      status: 'failed',
      title: 'Book One'
    });

    renderBookActionsPanel('node-book-1');

    fireEvent.click(await screen.findByRole('button', { name: 'Load EPUB' }));

    expect(await screen.findByText('Could not load this EPUB. Please try another file.')).toBeInTheDocument();
    expect(useWorkspaceStore.persist.rehydrate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Load EPUB' })).toBeInTheDocument();
  });
});

describe('ReadwiseBookActionsPanel visibility', () => {
  beforeEach(() => {
    setupReadwiseBookActionsPanelMocks();
  });

  it('stays hidden for a non-book node', async () => {
    renderBookActionsPanel('node-plain-1');

    await waitFor(() => {
      expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: 'Download EPUB' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load EPUB' })).not.toBeInTheDocument();
  });

  it('stays hidden for a book that is already loaded', async () => {
    loadRuntimeReadwiseBooksInventory.mockResolvedValue({
      books: [
        {
          annotationStatus: 'has_highlights',
          bookKey: 'book-1',
          epubPath: '/tmp/book-1.epub',
          epubStatus: 'received',
          generatedNodeId: 'node-book-1',
          highlightMarkdownPath: '/tmp/book-1.md',
          importStatus: 'completed',
          nodeStatus: 'generated',
          title: 'Book One'
        }
      ],
      scannedAt: '2026-04-03T00:00:00.000Z'
    });

    renderBookActionsPanel('node-book-1');

    await waitFor(() => {
      expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: 'Download EPUB' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load EPUB' })).not.toBeInTheDocument();
  });
});

describe('ReadwiseBookActionsPanel progress', () => {
  beforeEach(() => {
    setupReadwiseBookActionsPanelMocks();
  });

  it('shows staged progress while loading an epub', async () => {
    let progressHandler: ((payload: { detail: string; nodeId: string; phase: string; progress: number }) => void) | null = null;
    let resolveLoad: ((value: {
      book_key: string;
      epub_path: string;
      status: 'selected';
      title: string;
    }) => void) | undefined;
    onRuntimeReadwiseBookEpubProgress.mockImplementation((handler) => {
      progressHandler = handler;
      return () => undefined;
    });
    loadRuntimeReadwiseBookEpub.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
          progressHandler?.({
            detail: 'Importing EPUB…',
            nodeId: 'node-book-1',
            phase: 'importing_epub',
            progress: 0.35
          });
          progressHandler?.({
            detail: 'Placing highlights…',
            nodeId: 'node-book-1',
            phase: 'placing_highlights',
            progress: 0.8
          });
        })
    );

    renderBookActionsPanel('node-book-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Load EPUB' }));

    expect(await screen.findByText('Placing highlights…')).toBeInTheDocument();
    if (resolveLoad) {
      resolveLoad({
        book_key: 'book-1',
        epub_path: '/tmp/book-1.epub',
        status: 'selected',
        title: 'Book One'
      });
    }
    await waitFor(() => {
      expect(useWorkspaceStore.persist.rehydrate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load EPUB' })).not.toBeInTheDocument();
    });
  });
});
