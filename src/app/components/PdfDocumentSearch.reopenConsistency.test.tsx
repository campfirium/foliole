import { render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { usePdfSearchEffect } from './PdfDocumentSearch';

function PdfSearchReopenConsistencyHarness() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, string>>({ 1: 'keyword bridge keyword' });
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [searchTarget] = useState({ id: 9, matchStart: 'keyword bridge '.length, page: 1 });

  usePdfSearchEffect({
    onSearchHighlightsChange: () => undefined,
    onSearchStatusChange: setSearchStatus,
    pageElementsRef,
    pageTextByNumberRef,
    scrollContainerRef,
    searchQuery: 'keyword',
    searchRequest: null,
    searchTarget,
    searchRevision: 1,
    totalPages: 1
  });

  return (
    <div ref={scrollContainerRef}>
      <div data-pdf-page-number="1" ref={(element) => { pageElementsRef.current[1] = element; }}>
        <div className="textLayer"><span role="presentation">keyword bridge keyword</span></div>
      </div>
      <p data-testid="pdf-search-reopen-status">{`${searchStatus.current}/${searchStatus.total}`}</p>
    </div>
  );
}

describe('usePdfSearchEffect reopen target consistency', () => {
  it('keeps target cursor consistent after reopening the same search target', async () => {
    const first = render(<PdfSearchReopenConsistencyHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-reopen-status')).toHaveTextContent('2/2');
    });

    first.unmount();
    render(<PdfSearchReopenConsistencyHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-reopen-status')).toHaveTextContent('2/2');
    });
  });
});
