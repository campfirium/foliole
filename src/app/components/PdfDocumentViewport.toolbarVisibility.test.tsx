import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
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

function useToolbarReplayScroll(page: number, zoom: number, shouldReplayToolbarScrollRef: MutableRefObject<boolean>) {
  useEffect(() => {
    if (!shouldReplayToolbarScrollRef.current) {
      return;
    }
    shouldReplayToolbarScrollRef.current = false;
    const scrollContainer = screen.getByTestId('pdf-scroll-container');
    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      value: 24,
      writable: true
    });
    fireEvent.scroll(scrollContainer);
  }, [page, zoom]);
}

function ToolbarVisibilityHarness() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const shouldReplayToolbarScrollRef = useRef(false);

  useToolbarReplayScroll(page, zoom, shouldReplayToolbarScrollRef);

  return (
    <PdfDocumentViewport
      clearPageJumpRequest={() => undefined}
      highlightLocators={[]}
      loadError={null}
      maxPage={3}
      onClearSearch={() => undefined}
      onContextMenu={() => undefined}
      onLoadError={() => undefined}
      onLoadSuccess={() => undefined}
      onNextPage={() => {
        shouldReplayToolbarScrollRef.current = true;
        setPage((current) => current + 1);
      }}
      onPageChange={setPage}
      onPreviousPage={() => {
        shouldReplayToolbarScrollRef.current = true;
        setPage((current) => Math.max(1, current - 1));
      }}
      onRotateClockwise={() => undefined}
      onSearchQueryChange={setSearchQuery}
      onSearchRequest={() => undefined}
      onSearchRequestHandled={() => undefined}
      onSearchStatusChange={setSearchStatus}
      onSearchTargetHandled={() => undefined}
      onSetZoom={(value) => {
        shouldReplayToolbarScrollRef.current = true;
        setZoom(value);
      }}
      onZoomIn={() => {
        shouldReplayToolbarScrollRef.current = true;
        setZoom((current) => current + 10);
      }}
      onZoomOut={() => {
        shouldReplayToolbarScrollRef.current = true;
        setZoom((current) => current - 10);
      }}
      page={page}
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
      totalPages={3}
      zoom={zoom}
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

function renderToolbarVisibilityHarness() {
  render(<ToolbarVisibilityHarness />);
  return {
    scrollContainer: screen.getByTestId('pdf-scroll-container'),
    toolbar: screen.getByTestId('pdf-document-toolbar')
  };
}

async function expectToolbarInteractionToKeepVisible(toolbar: HTMLElement, action: () => void) {
  action();
  await waitFor(() => expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true'));
}

describe('PdfDocumentViewport toolbar visibility', () => {
  it('hides on downward scroll and returns on upward scroll', () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    const { scrollContainer, toolbar } = renderToolbarVisibilityHarness();

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
    const { scrollContainer, toolbar } = renderToolbarVisibilityHarness();
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
    const { scrollContainer, toolbar } = renderToolbarVisibilityHarness();

    setScrollTopAndScroll(scrollContainer, 220);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');

    setScrollTopAndScroll(scrollContainer, 280);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  });

  it('keeps the toolbar visible after page and zoom actions until the next reading scroll', async () => {
    collectTextSegmentsSpy.mockReturnValue([]);
    const { scrollContainer, toolbar } = renderToolbarVisibilityHarness();

    setScrollTopAndScroll(scrollContainer, 80);
    setScrollTopAndScroll(scrollContainer, 120);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    await expectToolbarInteractionToKeepVisible(toolbar, () => fireEvent.click(screen.getByLabelText('Next page')));

    setScrollTopAndScroll(scrollContainer, 64);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');

    await expectToolbarInteractionToKeepVisible(toolbar, () => fireEvent.click(screen.getByLabelText('Zoom in')));

    setScrollTopAndScroll(scrollContainer, 96);
    expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  });
});
