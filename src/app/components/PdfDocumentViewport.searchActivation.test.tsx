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
      React.useEffect(() => {
        onLoadSuccess?.({ numPages: 1 });
      }, [file, onLoadSuccess]);
      return <div data-testid="pdf-document-view">{children}</div>;
    },
    Page: ({
      onGetTextSuccess,
      onRenderTextLayerSuccess
    }: {
      onGetTextSuccess?: (payload: { items: Array<{ str: string }> }) => void;
      onRenderTextLayerSuccess?: () => void;
    }) => {
      React.useEffect(() => {
        onGetTextSuccess?.({ items: [{ str: 'keyword bridge content' }] });
        onRenderTextLayerSuccess?.();
      }, [onGetTextSuccess, onRenderTextLayerSuccess]);
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
      onContextMenu={() => undefined}
      onLoadError={() => undefined}
      onLoadSuccess={() => undefined}
      onNextPage={() => undefined}
      onPageChange={() => undefined}
      onPreviousPage={() => undefined}
      onRotateClockwise={() => undefined}
      onSearchQueryChange={setSearchQuery}
      onSearchRequest={() => undefined}
      onSearchRequestHandled={() => undefined}
      onSearchStatusChange={setSearchStatus}
      onSearchTargetHandled={() => undefined}
      onZoomIn={() => undefined}
      onZoomOut={() => undefined}
      page={1}
      pageJumpRequest={null}
      pdfSelectionLocator={undefined}
      pdfSource="/tmp/sample.pdf"
      rotation={0}
      searchIndexingHint={null}
      searchQuery={searchQuery}
      searchRequest={null}
      searchTarget={null}
      searchStatus={searchStatus}
      setVisiblePage={() => undefined}
      totalPages={1}
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

    fireEvent.change(screen.getByLabelText('PDF search'), { target: { value: 'keyword' } });

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 1');
    });
  });
});
