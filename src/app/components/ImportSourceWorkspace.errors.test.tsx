import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it('shows a retryable error when the imports overview fails to load', async () => {
  loadRuntimeReadwiseBooksInventory.mockRejectedValueOnce(new Error('inventory unavailable'));

  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  await waitFor(() => {
    expect(screen.getByText('Imports could not be loaded.')).toBeInTheDocument();
  });
  expect(screen.queryByText('Imports are empty')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });
});

it('shows a retryable error when Readwise Books fail to load', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.importManagementActivePage, 'readwise-books');
  loadRuntimeReadwiseBooksInventory.mockRejectedValueOnce(new Error('readwise unavailable'));

  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  await waitFor(() => {
    expect(screen.getByText('Readwise Books could not be loaded.')).toBeInTheDocument();
  });
  expect(screen.queryByText('Readwise Books is empty')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('Book A')).toBeInTheDocument();
  });
});

it('shows a retryable error when PDF imports fail to load', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.importManagementActivePage, 'pdf');
  loadRuntimePdfImportsInventory.mockRejectedValueOnce(new Error('pdf unavailable'));

  render(<ImportSourceWorkspace onOpenChange={() => undefined} open />);

  await waitFor(() => {
    expect(screen.getByText('PDF imports could not be loaded.')).toBeInTheDocument();
  });
  expect(screen.queryByText('PDF is empty')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(screen.getByText('Book A.pdf')).toBeInTheDocument();
  });
});
