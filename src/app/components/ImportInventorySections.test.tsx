import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ReadwiseBooksInventorySection } from './ImportOverviewSections';
import { PdfImportsInventorySection } from './ImportPdfOverviewSection';

it('renders readwise books inside the shared list surface and keeps import actions working', () => {
  const onOpenBookNode = vi.fn();
  const onResetBookImport = vi.fn();

  render(
    <ReadwiseBooksInventorySection
      inventory={{
        books: [
          {
            annotationStatus: 'has_highlights',
            bookKey: 'book-1',
            epubPath: null,
            epubStatus: 'received',
            fullDocumentMarkdownPath: null,
            generatedNodeId: 'node-1',
            highlightMarkdownPath: null,
            importStatus: 'completed',
            nodeStatus: 'generated',
            title: 'Atomic Habits'
          }
        ],
        fullDocumentDirectoryPath: '/library/full',
        highlightDirectoryPath: '/library/highlights',
        scannedAt: '2026-04-10T08:00:00.000Z'
      }}
      onOpenBookNode={onOpenBookNode}
      onResetBookImport={onResetBookImport}
    />
  );

  expect(screen.getByRole('heading', { level: 2, name: 'Books inventory' })).toBeInTheDocument();
  expect(screen.getByText('Atomic Habits')).toBeInTheDocument();
  expect(screen.getByText('Has highlights')).toBeInTheDocument();
  expect(screen.getByText('Loaded')).toBeInTheDocument();
  expect(screen.getByText('Highlights available. Imported node is ready to open.')).toBeInTheDocument();
  expect(screen.getByText('Updated 2026-04-10 08:00')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Atomic Habits' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  expect(onOpenBookNode).toHaveBeenCalledWith('node-1');
  expect(onResetBookImport).toHaveBeenCalledWith({ nodeId: 'node-1', title: 'Atomic Habits' });
});

it('renders pdf inventory inside the shared list surface', () => {
  render(
    <PdfImportsInventorySection
      inventory={{
        items: [
          {
            lastImportedAt: '2026-04-10T07:30:00.000Z',
            latestNodeId: 'node-pdf-1',
            nodeStatus: 'generated',
            pdfIndexedAt: '2026-04-10T07:35:00.000Z',
            pdfIndexStatus: 'ready',
            sourceFingerprint: 'pdf-1',
            sourceLocator: '/library/pdfs/essay.pdf',
            sourceName: 'Essay PDF'
          }
        ],
        scannedAt: '2026-04-10T08:00:00.000Z'
      }}
    />
  );

  expect(screen.getByRole('heading', { level: 2, name: 'PDF inventory' })).toBeInTheDocument();
  expect(screen.getByText('Essay PDF')).toBeInTheDocument();
  expect(screen.getByText('pdf · /library/pdfs/essay.pdf')).toBeInTheDocument();
  expect(screen.getByText('Indexed')).toBeInTheDocument();
  expect(screen.getByText('Loaded')).toBeInTheDocument();
  expect(screen.getByText('Imported node is available and the PDF index is ready.')).toBeInTheDocument();
  expect(screen.getByText('Updated 2026-04-10 07:30')).toBeInTheDocument();
});
