import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { InboxImportLanding } from './InboxImportLanding';

const { loadRuntimeReadwiseBooksInventory } = vi.hoisted(() => ({
  loadRuntimeReadwiseBooksInventory: vi.fn()
}));

vi.mock('../hooks/useFormalImport', () => ({
  useFormalImport: () => ({
    isAvailable: true,
    isImporting: false,
    overview: {
      latestFailure: null,
      latestResult: null,
      recentRuns: []
    },
    resetImportData: vi.fn(),
    startImportDirectory: vi.fn(),
    startImportFile: vi.fn(),
    status: {
      failures: '',
      inboxLanding: '',
      lastRun: ''
    }
  })
}));

vi.mock('../../shared/platform/readwiseBooksBridge', () => ({
  loadRuntimeReadwiseBooksInventory
}));

beforeEach(() => {
  loadRuntimeReadwiseBooksInventory.mockReset();
});

it('renders the shared books inventory with annotation, node, and EPUB states', async () => {
  loadRuntimeReadwiseBooksInventory.mockResolvedValue({
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
      },
      {
        annotationStatus: 'no_highlights',
        bookKey: 'book-b',
        epubPath: null,
        epubStatus: 'missing',
        fullDocumentMarkdownPath: '/tmp/Book B.md',
        generatedNodeId: null,
        highlightMarkdownPath: null,
        importStatus: 'pending',
        nodeStatus: 'missing',
        title: 'Book B'
      }
    ],
    fullDocumentDirectoryPath: '/tmp/books',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T10:00:00.000Z'
  });

  render(<InboxImportLanding nodesById={{}} onSelectNode={() => undefined} />);

  expect(screen.getByRole('heading', { level: 3, name: 'Books inventory' })).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });

  expect(screen.getByText('Book B')).toBeInTheDocument();
  expect(screen.getByText('Has highlights')).toBeInTheDocument();
  expect(screen.getByText('No highlights')).toBeInTheDocument();
  expect(screen.getByText('Node ready')).toBeInTheDocument();
  expect(screen.getByText('Node missing')).toBeInTheDocument();
  expect(screen.getByText('EPUB received')).toBeInTheDocument();
  expect(screen.getByText('EPUB missing')).toBeInTheDocument();
});
