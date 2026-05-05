import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

describe('renderPdfPage', () => {
  it('keeps text layer font styles intact after text layer render succeeds', async () => {
    const pageElementsRef = { current: {} as Record<number, HTMLDivElement | null> };
    const onTextContentLoad = vi.fn();
    const onTextLayerRender = vi.fn();

    render(
      renderPdfPage({
        highlightLocators: [],
        onTextContentLoad,
        onTextLayerRender,
        pageElementsRef,
        pageNumber: 1,
        pdfSelectionLocator: undefined,
        rotation: 0,
        searchHighlights: [],
        zoom: 100
      })
    );

    await waitFor(() => {
      expect(onTextLayerRender).toHaveBeenCalledWith(1);
    });

    expect(onTextContentLoad).toHaveBeenCalled();
    expect(screen.getByRole('presentation')).toHaveStyle({ fontFamily: 'MockPdfFont' });
  });
});
