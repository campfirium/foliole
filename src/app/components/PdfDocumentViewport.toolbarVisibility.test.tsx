import { fireEvent, render, screen } from '@testing-library/react';
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

function ToolbarVisibilityHarness() {
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

function setScrollTopAndScroll(container: HTMLElement, scrollTop: number) {
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    value: scrollTop,
    writable: true
  });
  fireEvent.scroll(container);
}

describe('PdfDocumentViewport toolbar visibility', () => {
  it('hides on downward scroll and returns on upward scroll', () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    render(<ToolbarVisibilityHarness />);

    const toolbar = screen.getByTestId('pdf-document-toolbar');
    const scrollContainer = screen.getByTestId('pdf-scroll-container');

    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 80);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    setScrollTopAndScroll(scrollContainer, 40);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  });

  it('stays visible while the search field is active', () => {
    collectTextSegmentsSpy.mockImplementation((shell: HTMLDivElement) => {
      const span = shell.querySelector<HTMLElement>('.textLayer span[role="presentation"]');
      const node = span?.firstChild instanceof Text ? span.firstChild : new Text(span?.textContent ?? '');
      return span
        ? [{ element: span, end: node.textContent?.length ?? 0, node, start: 0, text: node.textContent ?? '' }]
        : [];
    });
    render(<ToolbarVisibilityHarness />);

    const toolbar = screen.getByTestId('pdf-document-toolbar');
    const scrollContainer = screen.getByTestId('pdf-scroll-container');
    const searchInput = screen.getByLabelText('PDF search');

    setScrollTopAndScroll(scrollContainer, 80);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    fireEvent.focus(searchInput);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    fireEvent.change(searchInput, { target: { value: 'keyword' } });
    setScrollTopAndScroll(scrollContainer, 160);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  });

  it('stays visible on the first restored scroll position before any user scroll gesture', () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    render(<ToolbarVisibilityHarness />);

    const toolbar = screen.getByTestId('pdf-document-toolbar');
    const scrollContainer = screen.getByTestId('pdf-scroll-container');

    setScrollTopAndScroll(scrollContainer, 220);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 280);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  });
});
