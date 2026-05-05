import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsBridge';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksBridge';

import { sortOverviewItems } from './importOverviewSorting';
import { ImportSourceWorkspace } from './ImportSourceWorkspace';
import { filterPdfInventory, sortPdfItems } from './ImportSourceWorkspacePdfPage';
import { filterBooksInventory, sortBooks } from './ImportSourceWorkspaceReadwiseBooksPage';

const { loadRuntimeReadwiseBookEpub, loadRuntimeReadwiseBooksInventory, resetRuntimeReadwiseBookImport, loadRuntimePdfImportsInventory } = vi.hoisted(() => ({
  loadRuntimeReadwiseBookEpub: vi.fn(),
  loadRuntimeReadwiseBooksInventory: vi.fn(),
  resetRuntimeReadwiseBookImport: vi.fn(),
  loadRuntimePdfImportsInventory: vi.fn()
}));

vi.mock('../../shared/platform/readwiseBooksBridge', () => ({
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  resetRuntimeReadwiseBookImport
}));
vi.mock('../../shared/platform/pdfImportsBridge', () => ({
  loadRuntimePdfImportsInventory
}));

beforeEach(() => {
  window.localStorage.clear();
  loadRuntimeReadwiseBookEpub.mockReset();
  loadRuntimeReadwiseBooksInventory.mockReset();
  resetRuntimeReadwiseBookImport.mockReset();
  loadRuntimePdfImportsInventory.mockReset();
  loadRuntimeReadwiseBookEpub.mockResolvedValue({
    book_key: 'book-a',
    epub_path: '/tmp/Book A.epub',
    status: 'selected',
    title: 'Book A'
  });
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
      }
    ],
    fullDocumentDirectoryPath: '/tmp/books',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T10:00:00.000Z'
  });
  loadRuntimePdfImportsInventory.mockResolvedValue({
    items: [
      {
        lastImportedAt: '2026-04-04T01:00:00.000Z',
        latestNodeId: 'node-book-a',
        nodeStatus: 'generated',
        pdfIndexedAt: '2026-04-04T01:05:00.000Z',
        pdfIndexStatus: 'ready',
        sourceFingerprint: 'pdf-source-1',
        sourceLocator: '/tmp/Book A.pdf',
        sourceName: 'Book A.pdf'
      }
    ],
    scannedAt: '2026-04-04T01:06:00.000Z'
  });
});

it('shows the import management navigation shell without readwise settings controls', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('navigation', { name: 'Import management navigation' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Imports' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Articles' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader settings')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Readwise Reader settings' })).not.toBeInTheDocument();
  const importsPage = screen.getByRole('region', { name: 'Imports page' });
  await waitFor(() => {
    expect(within(importsPage).getByRole('heading', { level: 2, name: 'Imports' })).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'Sort imports by Date saved' })).toBeInTheDocument();
});

it('switches the content container when a navigation item is selected', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Books' }));
  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search imported books' }), { target: { value: 'missing' } });
  expect(screen.queryByText('Book A')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Readwise Articles' }));
  expect(screen.getByText('Readwise article content will appear here once the list view is ready.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
  await waitFor(() => {
    expect(screen.getByText('Book A.pdf')).toBeInTheDocument();
  });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search imported PDFs' }), { target: { value: 'missing' } });
  expect(screen.queryByText('Book A.pdf')).not.toBeInTheDocument();
});

it('filters and sorts books for the Readwise Books panel', () => {
  const inventory: RuntimeReadwiseBooksInventory = {
    books: [
      {
        annotationStatus: 'has_highlights',
        bookKey: 'book-z',
        epubPath: '/tmp/Zebra.epub',
        epubStatus: 'received',
        fullDocumentMarkdownPath: '/tmp/Zebra.md',
        generatedNodeId: 'node-z',
        highlightMarkdownPath: '/tmp/Zebra Highlights.md',
        importStatus: 'completed',
        nodeStatus: 'generated',
        title: 'Zebra Book'
      },
      {
        annotationStatus: 'no_highlights',
        bookKey: 'book-a',
        epubPath: '/tmp/Alpha.epub',
        epubStatus: 'received',
        fullDocumentMarkdownPath: '/tmp/Alpha.md',
        generatedNodeId: null,
        highlightMarkdownPath: '/tmp/Alpha Highlights.md',
        importStatus: 'pending',
        nodeStatus: 'missing',
        title: 'Alpha Book'
      }
    ],
    fullDocumentDirectoryPath: '/tmp/books',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T10:00:00.000Z'
  };

  expect(filterBooksInventory('alpha', inventory)?.books.map((book) => book.title)).toEqual(['Alpha Book']);
  expect(sortBooks(inventory.books, 'title', 'desc', { scannedAt: inventory.scannedAt }).map((book) => book.title)).toEqual(['Zebra Book', 'Alpha Book']);
});

it('filters and sorts PDFs for the PDF panel', () => {
  const inventory: RuntimePdfImportsInventory = {
    items: [
      {
        lastImportedAt: '2026-04-04T01:00:00.000Z',
        latestNodeId: 'node-z',
        nodeStatus: 'generated',
        pdfIndexedAt: '2026-04-04T01:05:00.000Z',
        pdfIndexStatus: 'ready',
        sourceFingerprint: 'pdf-z',
        sourceLocator: '/tmp/Zebra.pdf',
        sourceName: 'Zebra.pdf'
      },
      {
        lastImportedAt: '2026-04-04T02:00:00.000Z',
        latestNodeId: 'node-a',
        nodeStatus: 'generated',
        pdfIndexedAt: '2026-04-04T02:05:00.000Z',
        pdfIndexStatus: 'ready',
        sourceFingerprint: 'pdf-a',
        sourceLocator: '/tmp/Alpha.pdf',
        sourceName: 'Alpha.pdf'
      }
    ],
    scannedAt: '2026-04-04T02:06:00.000Z'
  };

  expect(filterPdfInventory('alpha', inventory)?.items.map((item) => item.sourceName)).toEqual(['Alpha.pdf']);
  expect(sortPdfItems(inventory.items, 'title', 'asc').map((item) => item.sourceName)).toEqual(['Alpha.pdf', 'Zebra.pdf']);
});

it('filters inbox items from the shared import search field', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  await waitFor(() => {
    expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    expect(loadRuntimePdfImportsInventory).toHaveBeenCalled();
  });

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search all imports' }), { target: { value: 'missing' } });

  expect(screen.queryByText('Book A')).not.toBeInTheDocument();
  expect(screen.getByText('No imported Inbox children or recent runs yet.')).toBeInTheDocument();
});

it('sorts the combined imports data by title when requested', () => {
  const sorted = sortOverviewItems(
    [
      { sortLastOpened: null, sortSaved: '2026-04-03T10:00:00.000Z', sortTitle: 'Zebra Book' },
      { sortLastOpened: null, sortSaved: '2026-04-04T01:00:00.000Z', sortTitle: 'Alpha PDF' },
      { sortLastOpened: null, sortSaved: '2026-04-05T01:00:00.000Z', sortTitle: 'Essay note' }
    ],
    'title',
    'asc'
  );

  expect(sorted.map((item) => item.sortTitle)).toEqual(['Alpha PDF', 'Essay note', 'Zebra Book']);
});

it('shows pdf status badges before filtering them away', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
  await waitFor(() => {
    expect(screen.getByText('Book A.pdf')).toBeInTheDocument();
  });
  expect(screen.getByText('Loaded')).toBeInTheDocument();
  expect(screen.getByText('Indexed')).toBeInTheDocument();
});

it('shows deleted and pending-index states in pdf inventory', async () => {
  loadRuntimePdfImportsInventory.mockResolvedValue({
    items: [
      {
        lastImportedAt: '2026-04-04T01:00:00.000Z',
        latestNodeId: 'node-deleted',
        nodeStatus: 'deleted',
        pdfIndexedAt: null,
        pdfIndexStatus: null,
        sourceFingerprint: 'pdf-source-2',
        sourceLocator: '/tmp/Deleted.pdf',
        sourceName: 'Deleted.pdf'
      },
      {
        lastImportedAt: '2026-04-04T02:00:00.000Z',
        latestNodeId: 'node-new',
        nodeStatus: 'generated',
        pdfIndexedAt: null,
        pdfIndexStatus: null,
        sourceFingerprint: 'pdf-source-3',
        sourceLocator: '/tmp/New.pdf',
        sourceName: 'New.pdf'
      }
    ],
    scannedAt: '2026-04-04T02:06:00.000Z'
  });
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
  await waitFor(() => {
    expect(screen.getByText('Deleted.pdf')).toBeInTheDocument();
  });

  expect(screen.getByText('Deleted')).toBeInTheDocument();
  expect(screen.getByText('Not indexed')).toBeInTheDocument();
  expect(screen.getByText('Pending index')).toBeInTheDocument();
});

it('restores the last active import management page from persistent settings', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.importManagementActivePage, 'readwise-books');

  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('button', { name: 'Readwise Books' })).toHaveAttribute('aria-pressed', 'true');
  await act(() => Promise.resolve());
});

it('closes import management from the header close button', async () => {
  const onOpenChange = vi.fn();

  render(<ImportSourceWorkspace onOpenChange={onOpenChange} open />);
  await waitFor(() => {
    expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    expect(loadRuntimePdfImportsInventory).toHaveBeenCalled();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Close import management' }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
});
