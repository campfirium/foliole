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

vi.mock('../../shared/platform/readwiseBooksRuntimeRepository', () => ({
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  resetRuntimeReadwiseBookImport
}));
vi.mock('../../shared/platform/pdfImportsRuntimeRepository', () => ({
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

it('shows the Watch Manager navigation shell without readwise settings controls', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('navigation', { name: 'Watch Manager navigation' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Recent Imports' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Inbox History' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Books' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Articles' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
  expect(screen.queryByText('Readwise Reader settings')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Readwise Reader settings' })).not.toBeInTheDocument();
  const importsPage = screen.getByRole('region', { name: 'Recent Imports page' });
  await waitFor(() => {
    expect(within(importsPage).getByRole('heading', { level: 2, name: 'Recent Imports' })).toBeInTheDocument();
  });
  const sortButton = screen.getByRole('button', { name: 'Sort imports by Date imported' });
  expect(sortButton).toBeInTheDocument();
  fireEvent.keyDown(sortButton, { key: 'ArrowDown' });
  expect(screen.getByRole('menuitem', { name: 'Last opened' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Date imported' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Title' })).toBeInTheDocument();
  expect(screen.getByRole('menu')).toHaveClass('z-[82]');
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
  expect(screen.getByRole('searchbox', { name: 'Search Readwise articles' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort imports by Date imported' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('Readwise Articles is empty')).toBeInTheDocument();
  });

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

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search recent imports' }), { target: { value: 'missing' } });

  expect(screen.queryByText('Book A')).not.toBeInTheDocument();
  expect(screen.getByText('No recent import runs yet.')).toBeInTheDocument();
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

it('restores the last active Watch Manager page from persistent settings', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.importManagementActivePage, 'readwise-books');

  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  expect(screen.getByRole('button', { name: 'Readwise Books' })).toHaveAttribute('aria-pressed', 'true');
  await act(() => Promise.resolve());
});

it('does not show a header close button inside Watch Manager', async () => {
  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);
  await waitFor(() => {
    expect(loadRuntimeReadwiseBooksInventory).toHaveBeenCalled();
    expect(loadRuntimePdfImportsInventory).toHaveBeenCalled();
  });

  expect(screen.queryByRole('button', { name: 'Close Watch Manager' })).not.toBeInTheDocument();
});
