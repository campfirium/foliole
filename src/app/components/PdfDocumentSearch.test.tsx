import { render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { usePdfSearchEffect } from './PdfDocumentSearch';

function PdfSearchLateTextLayerHarness() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [textReady, setTextReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTextReady(true);
    }, 20);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  usePdfSearchEffect({
    onSearchStatusChange: setSearchStatus,
    pageElementsRef,
    scrollContainerRef,
    searchQuery: 'keyword',
    searchRequest: null,
    searchRevision: 0,
    totalPages: 1
  });

  return (
    <div ref={scrollContainerRef}>
      <div
        data-pdf-page-number="1"
        ref={(element) => {
          pageElementsRef.current[1] = element;
        }}
      >
        {textReady ? (
          <div className="textLayer">
            <span role="presentation">keyword appears after text layer render</span>
          </div>
        ) : null}
      </div>
      <p data-testid="pdf-search-status-observer-test">{`${searchStatus.current}/${searchStatus.total}/${searchStatus.hasQuery ? 'query' : 'idle'}`}</p>
    </div>
  );
}

describe('usePdfSearchEffect', () => {
  it('updates search status when text layer content appears after the query is already set', async () => {
    render(<PdfSearchLateTextLayerHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-status-observer-test')).toHaveTextContent('1/1/query');
    });
  });
});
