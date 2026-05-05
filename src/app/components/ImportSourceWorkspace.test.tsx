import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import { ImportSourceWorkspace } from './ImportSourceWorkspace';

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
  expect(screen.getByRole('searchbox', { name: 'Search imported articles' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort imports by Date saved' })).toBeInTheDocument();
  expect(screen.getByText('Readwise Articles is empty')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
  await waitFor(() => {
    expect(screen.getByText('Book A.pdf')).toBeInTheDocument();
  });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search imported PDFs' }), { target: { value: 'missing' } });
  expect(screen.queryByText('Book A.pdf')).not.toBeInTheDocument();
});

it('filters inbox items from the shared import search field', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  await waitFor(() => {
    expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    expect(loadRuntimePdfImportsInventory).toHaveBeenCalled();
  });

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search all imports' }), { target: { value: 'missing' } });

  expect(screen.queryByText('Book A')).not.toBeInTheDocument();
  expect(screen.getByText('No imported Inbox topics or recent runs yet.')).toBeInTheDocument();
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

it('does not render a header close button in import management', async () => {
  const onOpenChange = vi.fn();

  render(<ImportSourceWorkspace onOpenChange={onOpenChange} open />);
  await waitFor(() => {
    expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    expect(loadRuntimePdfImportsInventory).toHaveBeenCalled();
  });

  expect(screen.queryByRole('button', { name: 'Close import management' })).not.toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalled();
});
