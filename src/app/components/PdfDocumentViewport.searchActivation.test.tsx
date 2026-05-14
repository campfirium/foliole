import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { collectTextSegmentsSpy } = vi.hoisted(() => ({
  collectTextSegmentsSpy: vi.fn()
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
      const onLoadSuccessRef = React.useRef(onLoadSuccess);

      React.useEffect(() => {
        onLoadSuccessRef.current = onLoadSuccess;
      }, [onLoadSuccess]);

      React.useEffect(() => {
        onLoadSuccessRef.current?.({ numPages: 1 });
      }, [file]);
      return <div data-testid="pdf-document-view">{children}</div>;
    },
    Page: ({
      onGetTextSuccess,
      onRenderSuccess,
      onRenderTextLayerSuccess
    }: {
      onGetTextSuccess?: (payload: { items: Array<{ str: string }> }) => void;
      onRenderSuccess?: () => void;
      onRenderTextLayerSuccess?: () => void;
    }) => {
      const onGetTextSuccessRef = React.useRef(onGetTextSuccess);
      const onRenderSuccessRef = React.useRef(onRenderSuccess);
      const onRenderTextLayerSuccessRef = React.useRef(onRenderTextLayerSuccess);

      React.useEffect(() => {
        onGetTextSuccessRef.current = onGetTextSuccess;
        onRenderSuccessRef.current = onRenderSuccess;
        onRenderTextLayerSuccessRef.current = onRenderTextLayerSuccess;
      }, [onGetTextSuccess, onRenderSuccess, onRenderTextLayerSuccess]);

      React.useEffect(() => {
        onRenderSuccessRef.current?.();
        onGetTextSuccessRef.current?.({ items: [{ str: 'keyword bridge content' }] });
        onRenderTextLayerSuccessRef.current?.();
      }, []);
      return (
        <div data-testid="pdf-document-page">
          <div className="textLayer">
            <span role="presentation">keyword bridge content</span>
          </div>
        </div>
      );
    }
  };
});

vi.mock('./pdfSearchTextSegments', () => ({
  collectTextSegments: collectTextSegmentsSpy
}));

import { PdfDocumentViewport } from './PdfDocumentViewport';

function PdfDocumentViewportSearchActivationHarness() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });

  return (
    <PdfDocumentViewport
      clearPageJumpRequest={() => undefined}
      highlightLocators={[]}
      loadError={null}
      maxPage={1}
      onClearSearch={() => undefined}
      onContextMenu={() => undefined}
      onLoadError={() => undefined}
      onLoadSuccess={() => undefined}
      onRetryLoad={() => undefined}
      onNextPage={() => undefined}
      onPageChange={() => undefined}
      onPdfReadingModeChange={() => undefined}
      onPreviousPage={() => undefined}
      onRotateClockwise={() => undefined}
      onSearchQueryChange={setSearchQuery}
      onSearchRequest={() => undefined}
      onSearchRequestHandled={() => undefined}
      onSearchStatusChange={setSearchStatus}
      onSearchTargetHandled={() => undefined}
      onSetFitWidth={() => undefined}
      onSetZoom={() => undefined}
      onZoomIn={() => undefined}
      onZoomOut={() => undefined}
      visiblePage={1}
      page={1}
      pageJumpRequest={null}
      persistedPageCount={1}
      persistedPageDimensions={{ 1: { height: 1131, width: 800 } }}
      pdfReadingMode="original"
      pdfSelectionLocator={undefined}
      pdfSource="/tmp/sample.pdf"
      rotation={0}
      searchIndexingHint={null}
      searchQuery={searchQuery}
      searchRequest={null}
      searchTarget={null}
      searchStatus={searchStatus}
      setVisibleLocation={() => undefined}
      totalPages={1}
      zoomMode="fit-width"
      zoom={100}
    />
  );
}

describe('PdfDocumentViewport search activation', () => {
  it('rechecks the existing text layer when search starts after the page was already idle-rendered', async () => {
    collectTextSegmentsSpy.mockImplementationOnce(() => []).mockImplementation((shell: HTMLDivElement) => {
      const span = shell.querySelector<HTMLElement>('.textLayer span[role="presentation"]');
      const node = span?.firstChild instanceof Text ? span.firstChild : new Text(span?.textContent ?? '');
      return span
        ? [{ element: span, end: node.textContent?.length ?? 0, node, start: 0, text: node.textContent ?? '' }]
        : [];
    });

    render(<PdfDocumentViewportSearchActivationHarness />);
    await waitFor(() => expect(screen.getByLabelText('PDF search')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('PDF search'), { target: { value: 'keyword' } });

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 1');
    });
  });

  it('finds matches when the query starts after the page opened idle', async () => {
    collectTextSegmentsSpy.mockImplementation((shell: HTMLDivElement) => {
      const span = shell.querySelector<HTMLElement>('.textLayer span[role="presentation"]');
      const node = span?.firstChild instanceof Text ? span.firstChild : new Text(span?.textContent ?? '');
      return span
        ? [{ element: span, end: node.textContent?.length ?? 0, node, start: 0, text: node.textContent ?? '' }]
        : [];
    });

    render(<PdfDocumentViewportSearchActivationHarness />);
    await waitFor(() => expect(screen.getByLabelText('PDF search')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('PDF search'), { target: { value: 'keyword' } });

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 1');
    });
  });
});
