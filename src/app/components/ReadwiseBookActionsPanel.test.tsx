import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadRuntimeReadwiseBookEpub, loadRuntimeReadwiseBooksInventory, openRuntimeReadwiseBookDownload } = vi.hoisted(() => ({
  loadRuntimeReadwiseBookEpub: vi.fn(),
  loadRuntimeReadwiseBooksInventory: vi.fn(),
  openRuntimeReadwiseBookDownload: vi.fn()
}));

vi.mock('../../shared/platform/readwiseBooksBridge', () => ({
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  openRuntimeReadwiseBookDownload
}));

import { ReadwiseBookActionsPanel } from './ReadwiseBookActionsPanel';

describe('ReadwiseBookActionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    openRuntimeReadwiseBookDownload.mockResolvedValue({
      book_key: 'book-1',
      status: 'opened',
      title: 'Book One',
      url: 'https://example.com/book-1.epub'
    });
    loadRuntimeReadwiseBookEpub.mockResolvedValue({
      book_key: 'book-1',
      epub_path: '/tmp/book-1.epub',
      status: 'selected',
      title: 'Book One'
    });
  });

  it('renders manual EPUB actions for the matching book node', async () => {
    render(<ReadwiseBookActionsPanel activeNodeId="node-book-1" />);

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
    expect(await screen.findByText('Loaded an EPUB for Book One.')).toBeInTheDocument();
    expect(screen.getByText('EPUB already received. You can load another file if you want to replace it.')).toBeInTheDocument();
  });

  it('stays hidden for a non-book node', async () => {
    render(<ReadwiseBookActionsPanel activeNodeId="node-plain-1" />);

    await waitFor(() => {
      expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: 'Download EPUB' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load EPUB' })).not.toBeInTheDocument();
  });
});
