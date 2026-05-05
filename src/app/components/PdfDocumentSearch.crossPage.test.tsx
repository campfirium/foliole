import { render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { usePdfSearchEffect, type PdfSearchVisualHighlight } from './PdfDocumentSearch';

function PdfSearchCrossPageHarness() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, string>>({ 1: 'alpha bri', 2: 'dge omega' });
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [searchHighlights, setSearchHighlights] = useState<PdfSearchVisualHighlight[]>([]);

  usePdfSearchEffect({
    onSearchDebugChange: () => undefined,
    onSearchHighlightsChange: setSearchHighlights,
    onSearchStatusChange: setSearchStatus,
    pageElementsRef,
    pageTextByNumberRef,
    scrollContainerRef,
    searchQuery: 'bridge',
    searchRequest: null,
    searchTarget: null,
    searchRevision: 1,
    totalPages: 2
  });

  return (
    <div ref={scrollContainerRef}>
      <div data-pdf-page-number="1" ref={(element) => { pageElementsRef.current[1] = element; }}>
        <div className="textLayer"><span role="presentation">alpha bri</span></div>
      </div>
      <div data-pdf-page-number="2" ref={(element) => { pageElementsRef.current[2] = element; }}>
        <div className="textLayer"><span role="presentation">dge omega</span></div>
      </div>
      <p data-testid="pdf-search-cross-page-status">{`${searchStatus.current}/${searchStatus.total}`}</p>
      <p data-testid="pdf-search-cross-page-fragments">{searchHighlights[0]?.fragments?.map((fragment) => fragment.page).join(',') ?? 'none'}</p>
    </div>
  );
}

describe('usePdfSearchEffect cross-page coverage', () => {
  it('adds one cross-page match to the shared pdf search sequence without duplicating it', async () => {
    render(<PdfSearchCrossPageHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-cross-page-status')).toHaveTextContent('1/1');
    });
    expect(screen.getByTestId('pdf-search-cross-page-fragments')).toHaveTextContent('1,2');
  });
});
