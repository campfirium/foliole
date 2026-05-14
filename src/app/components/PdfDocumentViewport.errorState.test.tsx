import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { documentRenderSpy } = vi.hoisted(() => ({
  documentRenderSpy: vi.fn()
}));

vi.mock('react-pdf', async () => {
  const React = await import('react');
  return {
    Document: ({
      children,
      file,
      onLoadSuccess
    }: {
      children: React.ReactNode;
      file?: string;
      onLoadSuccess?: (payload: { numPages: number }) => void;
    }) => {
      documentRenderSpy(file);
      React.useEffect(() => {
        onLoadSuccess?.({ numPages: 1 });
      }, [file, onLoadSuccess]);
      return <div data-testid="pdf-document-view">{children}</div>;
    },
    Page: () => <div data-testid="pdf-document-page" />
  };
});

vi.mock('./pdfSearchTextSegments', () => ({
  collectTextSegments: vi.fn(() => [])
}));

import { PdfDocumentErrorState } from './PdfDocumentErrorState';
import { PdfDocumentViewport } from './PdfDocumentViewport';

function buildViewportProps(loadError: string | null, onRetryLoad: () => void) {
  return {
    clearPageJumpRequest: () => undefined,
    highlightLocators: [],
    loadError,
    maxPage: 1,
    onClearSearch: () => undefined,
    onContextMenu: () => undefined,
    onLoadError: () => undefined,
    onLoadSuccess: () => undefined,
    onRetryLoad,
    onNextPage: () => undefined,
    onPageChange: () => undefined,
    onPdfReadingModeChange: () => undefined,
    onPreviousPage: () => undefined,
    onRotateClockwise: () => undefined,
    onSearchQueryChange: () => undefined,
    onSearchRequest: () => undefined,
    onSearchRequestHandled: () => undefined,
    onSearchStatusChange: () => undefined,
    onSearchTargetHandled: () => undefined,
    onSetFitWidth: () => undefined,
    onSetZoom: () => undefined,
    onZoomIn: () => undefined,
    onZoomOut: () => undefined,
    visiblePage: 1,
    page: 1,
    pageJumpRequest: null,
    persistedPageCount: 1,
    persistedPageDimensions: { 1: { height: 1131, width: 800 } },
    pdfReadingMode: 'original' as const,
    pdfSelectionLocator: undefined,
    pdfSource: '/tmp/sample.pdf',
    rotation: 0,
    searchIndexingHint: null,
    searchQuery: '',
    searchRequest: null,
    searchTarget: null,
    searchStatus: { current: 0, hasQuery: false, total: 0 },
    setVisibleLocation: () => undefined,
    totalPages: 1,
    zoomMode: 'fit-width' as const,
    zoom: 100
  };
}

function RetryableErrorViewport() {
  const [loadError, setLoadError] = useState<string | null>('Failed to fetch PDF.');

  return <PdfDocumentViewport {...buildViewportProps(loadError, () => setLoadError(null))} />;
}

describe('PdfDocumentViewport error state', () => {
  it('shows an alert error state with retry action', () => {
    const onRetry = vi.fn();

    render(<PdfDocumentErrorState loadError="Failed to fetch PDF." onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('PDF preview unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch PDF.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('remounts the PDF document after retry clears the load error', async () => {
    documentRenderSpy.mockClear();

    render(<RetryableErrorViewport />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch PDF.');
    expect(documentRenderSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByTestId('pdf-document-view')).toBeInTheDocument());
    expect(documentRenderSpy).toHaveBeenCalledWith('/tmp/sample.pdf');
  });
});
