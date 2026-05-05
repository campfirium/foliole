import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('react-pdf', async () => {
  const React = await import('react');
  return {
    Page: ({
      onGetTextSuccess,
      onRenderTextLayerSuccess,
      pageNumber
    }: {
      onGetTextSuccess?: (payload: { items: Array<{ str: string }> }) => void;
      onRenderTextLayerSuccess?: () => void;
      pageNumber: number;
    }) => {
      React.useEffect(() => {
        onGetTextSuccess?.({ items: [{ str: `mock text ${pageNumber}` }] });
        onRenderTextLayerSuccess?.();
      }, [onGetTextSuccess, onRenderTextLayerSuccess, pageNumber]);

      return (
        <div data-testid="pdf-document-page">
          <div className="textLayer">
            <span role="presentation" style={{ fontFamily: 'MockPdfFont' }}>
              {`mock text ${pageNumber}`}
            </span>
          </div>
        </div>
      );
    }
  };
});

import { renderPdfPage } from './PdfDocumentPageRender';

const pageElementsRef = { current: {} as Record<number, HTMLDivElement | null> };
const firstSearchMatch = {
  id: 'match-a',
  isActive: true,
  page: 1,
  rects: [{ height: 0.04, width: 0.18, x: 0.1, y: 0.1 }],
  x: 0.1,
  y: 0.1
};
const secondSearchMatch = {
  id: 'match-b',
  isActive: false,
  page: 1,
  rects: [{ height: 0.04, width: 0.18, x: 0.1, y: 0.3 }],
  x: 0.1,
  y: 0.3
};
const crossPageSearchMatch = {
  id: 'match-cross',
  isActive: true,
  page: 1,
  fragments: [
    { page: 1, rects: [{ height: 0.04, width: 0.18, x: 0.1, y: 0.1 }], x: 0.1, y: 0.1 },
    { page: 2, rects: [{ height: 0.04, width: 0.2, x: 0.12, y: 0.22 }], x: 0.12, y: 0.22 }
  ],
  rects: [{ height: 0.04, width: 0.18, x: 0.1, y: 0.1 }],
  x: 0.1,
  y: 0.1
};

function renderPdfSearchPage(searchHighlights = [] as Array<typeof firstSearchMatch>) {
  const onTextContentLoad = vi.fn();
  const onTextLayerRender = vi.fn();
  return {
    ...render(
      renderPdfPage({
        highlightLocators: [],
        onTextContentLoad,
        onTextLayerRender,
        pageElementsRef,
        pageNumber: 1,
        pdfSelectionLocator: undefined,
        rotation: 0,
        searchHighlights,
        zoom: 100
      })
    ),
    onTextContentLoad,
    onTextLayerRender
  };
}

function findSearchMatchNode(container: HTMLElement, top: string) {
  return Array.from(container.querySelectorAll<HTMLElement>('span[data-testid^="pdf-search-match-"]')).find((node) => node.style.top === top);
}

it('keeps text layer font styles intact after text layer render succeeds', async () => {
  const { onTextContentLoad, onTextLayerRender } = renderPdfSearchPage();

  await waitFor(() => {
    expect(onTextLayerRender).toHaveBeenCalledWith(1);
  });

  expect(onTextContentLoad).toHaveBeenCalled();
  expect(screen.getByRole('presentation')).toHaveStyle({ fontFamily: 'MockPdfFont' });
});

it('keeps the same search highlight nodes while the active match changes', () => {
  const { container, rerender } = renderPdfSearchPage([firstSearchMatch, secondSearchMatch]);
  const firstMatchBefore = findSearchMatchNode(container, '10%');
  const secondMatchBefore = findSearchMatchNode(container, '30%');

  rerender(
    renderPdfPage({
      highlightLocators: [],
      onTextContentLoad: vi.fn(),
      onTextLayerRender: vi.fn(),
      pageElementsRef,
      pageNumber: 1,
      pdfSelectionLocator: undefined,
      rotation: 0,
      searchHighlights: [{ ...firstSearchMatch, isActive: false }, { ...secondSearchMatch, isActive: true }],
      zoom: 100
    })
  );

  expect(findSearchMatchNode(container, '10%')).toBe(firstMatchBefore);
  expect(findSearchMatchNode(container, '30%')).toBe(secondMatchBefore);
});

it('does not rerender the pdf page canvas when only the active search match changes', async () => {
  const onTextContentLoad = vi.fn();
  const onTextLayerRender = vi.fn();
  const { rerender } = render(
    renderPdfPage({
      highlightLocators: [],
      onTextContentLoad,
      onTextLayerRender,
      pageElementsRef,
      pageNumber: 1,
      pdfSelectionLocator: undefined,
      rotation: 0,
      searchHighlights: [firstSearchMatch, secondSearchMatch],
      zoom: 100
    })
  );

  await waitFor(() => {
    expect(onTextLayerRender).toHaveBeenCalledTimes(1);
  });

  rerender(
    renderPdfPage({
      highlightLocators: [],
      onTextContentLoad,
      onTextLayerRender,
      pageElementsRef,
      pageNumber: 1,
      pdfSelectionLocator: undefined,
      rotation: 0,
      searchHighlights: [{ ...firstSearchMatch, isActive: false }, { ...secondSearchMatch, isActive: true }],
      zoom: 100
    })
  );

  expect(onTextLayerRender).toHaveBeenCalledTimes(1);
});

it('renders the second-half highlight of a cross-page match on the next page', () => {
  const { container } = render(
    renderPdfPage({
      highlightLocators: [],
      onTextContentLoad: vi.fn(),
      onTextLayerRender: vi.fn(),
      pageElementsRef,
      pageNumber: 2,
      pdfSelectionLocator: undefined,
      rotation: 0,
      searchHighlights: [crossPageSearchMatch],
      zoom: 100
    })
  );

  expect(findSearchMatchNode(container, '22%')).toBeTruthy();
});
