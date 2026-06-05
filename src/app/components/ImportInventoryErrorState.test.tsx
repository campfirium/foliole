import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

const { loadPdfInventoryResult, loadReadwiseInventoryResult } = vi.hoisted(() => ({
  loadPdfInventoryResult: vi.fn(),
  loadReadwiseInventoryResult: vi.fn()
}));

vi.mock('../../shared/platform/pdfImportsInventoryLoadResult', () => ({
  loadRuntimePdfImportsInventoryResult: loadPdfInventoryResult
}));

vi.mock('../../shared/platform/readwiseBooksInventoryLoadResult', () => ({
  loadRuntimeReadwiseBooksInventoryResult: loadReadwiseInventoryResult
}));

vi.mock('../../shared/platform/readwiseBooksRuntimeRepository', async () => {
  const actual = await vi.importActual<typeof import('../../shared/platform/readwiseBooksRuntimeRepository')>(
    '../../shared/platform/readwiseBooksRuntimeRepository'
  );
  return {
    ...actual,
    resetRuntimeReadwiseBookImport: vi.fn()
  };
});

import { ImportOverviewPage } from './ImportOverviewPage';
import { ImportSourceWorkspacePdfPage } from './ImportSourceWorkspacePdfPage';
import { ImportSourceWorkspaceReadwiseBooksPage } from './ImportSourceWorkspaceReadwiseBooksPage';

const EMPTY_READWISE_INVENTORY = {
  books: [],
  fullDocumentDirectoryPath: '/tmp/books',
  highlightDirectoryPath: '/tmp/highlights',
  scannedAt: '2026-05-14T00:00:00.000Z'
};

const READWISE_INVENTORY_WITH_BOOK = {
  ...EMPTY_READWISE_INVENTORY,
  books: [
    {
      annotationStatus: 'has_highlights',
      bodyState: 'unloaded',
      bookKey: 'book-1',
      epubPath: null,
      epubStatus: 'missing',
      fullDocumentMarkdownPath: null,
      generatedNodeId: 'node-1',
      highlightState: 'pending',
      highlightMarkdownPath: null,
      highlightUnmatchedCount: null,
      importStatus: 'completed',
      nodeStatus: 'generated',
      title: 'Deep Work'
    }
  ]
};

const EMPTY_PDF_INVENTORY = {
  items: [],
  scannedAt: '2026-05-14T00:00:00.000Z'
};

const PDF_INVENTORY_WITH_ITEM = {
  ...EMPTY_PDF_INVENTORY,
  items: [
    {
      lastImportedAt: '2026-05-14T00:00:00.000Z',
      latestNodeId: 'node-pdf-1',
      nodeStatus: 'generated',
      pdfIndexedAt: '2026-05-14T00:05:00.000Z',
      pdfIndexStatus: 'ready',
      sourceFingerprint: 'pdf-1',
      sourceLocator: '/tmp/deep-work.pdf',
      sourceName: 'Deep Work PDF'
    }
  ]
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('PDF import inventory states', () => {
  it('keeps raw PDF load errors in the description and retries the inventory load', async () => {
    loadPdfInventoryResult.mockResolvedValue({ message: 'EACCES: permission denied', status: 'failed' });

    renderWithLocalization(<ImportSourceWorkspacePdfPage open />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load PDFs');
    expect(screen.getByRole('alert')).toHaveTextContent('EACCES: permission denied');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(loadPdfInventoryResult).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a disabled desktop-runtime state for PDF imports without Retry', async () => {
    loadPdfInventoryResult.mockResolvedValue({ status: 'unavailable' });

    renderWithLocalization(<ImportSourceWorkspacePdfPage open />);

    expect(await screen.findByText('Available in the desktop app')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Open Foliole in the desktop app to load PDFs.');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('keeps empty PDF imports distinct from failed loads', async () => {
    loadPdfInventoryResult.mockResolvedValue({ inventory: EMPTY_PDF_INVENTORY, status: 'loaded' });

    renderWithLocalization(<ImportSourceWorkspacePdfPage open />);

    expect(await screen.findByText('PDF is empty')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders loaded PDF imports as catalog rows', async () => {
    loadPdfInventoryResult.mockResolvedValue({ inventory: PDF_INVENTORY_WITH_ITEM, status: 'loaded' });

    renderWithLocalization(<ImportSourceWorkspacePdfPage open />);

    expect(await screen.findByText('Deep Work PDF')).toBeInTheDocument();
    expect(screen.getByText('Indexed')).toBeInTheDocument();
  });

});

describe('Readwise Books inventory states', () => {
  it('shows a disabled desktop-runtime state without Retry', async () => {
    loadReadwiseInventoryResult.mockResolvedValue({ status: 'unavailable' });

    renderWithLocalization(<ImportSourceWorkspaceReadwiseBooksPage onOpenChange={() => undefined} open />);

    expect(await screen.findByText('Available in the desktop app')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Open Foliole in the desktop app to load Readwise Books.');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('keeps raw load errors in the description and retries the inventory load', async () => {
    loadReadwiseInventoryResult.mockResolvedValue({ message: 'Readwise directory missing', status: 'failed' });

    renderWithLocalization(<ImportSourceWorkspaceReadwiseBooksPage onOpenChange={() => undefined} open />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load Readwise Books');
    expect(screen.getByRole('alert')).toHaveTextContent('Readwise directory missing');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(loadReadwiseInventoryResult).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps successful Readwise Books inventory rendering unchanged', async () => {
    loadReadwiseInventoryResult.mockResolvedValue({ inventory: EMPTY_READWISE_INVENTORY, status: 'loaded' });

    renderWithLocalization(<ImportSourceWorkspaceReadwiseBooksPage onOpenChange={() => undefined} open />);

    expect(await screen.findByText('Readwise Books is empty')).toBeInTheDocument();
    expect(screen.queryByText('Available in the desktop app')).not.toBeInTheDocument();
  });

  it('renders loaded Readwise Books as catalog rows', async () => {
    loadReadwiseInventoryResult.mockResolvedValue({ inventory: READWISE_INVENTORY_WITH_BOOK, status: 'loaded' });

    renderWithLocalization(<ImportSourceWorkspaceReadwiseBooksPage onOpenChange={() => undefined} open />);

    expect(await screen.findByText('Deep Work')).toBeInTheDocument();
    expect(screen.getByText('Has highlights')).toBeInTheDocument();
  });
});

describe('Recent Imports inventory states', () => {
  it('uses the shared product title for failures', async () => {
    loadReadwiseInventoryResult.mockResolvedValue({ inventory: EMPTY_READWISE_INVENTORY, status: 'loaded' });
    loadPdfInventoryResult.mockResolvedValue({ message: 'Failed to fetch PDF inventory.', status: 'failed' });

    renderWithLocalization(<ImportOverviewPage onOpenChange={() => undefined} open />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load recent imports');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch PDF inventory.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
