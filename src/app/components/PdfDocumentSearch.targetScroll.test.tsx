import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { usePdfSearchEffect } from './PdfDocumentSearch';

function configurePageElement(
  element: HTMLDivElement | null,
  pageElementsRef: MutableRefObject<Record<number, HTMLDivElement | null>>,
  pageNumber: number,
  top: number
) {
  pageElementsRef.current[pageNumber] = element;
  if (!element) {
    return;
  }
  Object.defineProperty(element, 'offsetTop', { configurable: true, value: top });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 300 });
}

function PdfSearchSingleTargetScrollHarness() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, string>>({
    1: 'first match entry',
    2: 'later page target phrase'
  });
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [searchRevision, setSearchRevision] = useState(0);
  const [searchTarget, setSearchTarget] = useState<{ id: number; matchStart: number; page: number } | null>({
    id: 1,
    matchStart: 11,
    page: 2
  });

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 200 });
  }, []);

  usePdfSearchEffect({
    onSearchDebugChange: () => undefined,
    onSearchHighlightsChange: () => undefined,
    onSearchRequestHandled: () => undefined,
    onSearchStatusChange: setSearchStatus,
    onSearchTargetHandled: (targetId) => {
      setSearchTarget((current) => (current?.id === targetId ? null : current));
    },
    pageElementsRef,
    pageTextByNumberRef,
    scrollContainerRef,
    searchQuery: 'target',
    searchRequest: null,
    searchTarget,
    searchRevision,
    totalPages: 2
  });

  return (
    <div ref={scrollContainerRef}>
      <div data-pdf-page-number="1" ref={(element) => configurePageElement(element, pageElementsRef, 1, 0)}>
        <div className="textLayer"><span role="presentation">first match entry</span></div>
      </div>
      <div data-pdf-page-number="2" ref={(element) => configurePageElement(element, pageElementsRef, 2, 600)}>
        <div className="textLayer"><span role="presentation">later page target phrase</span></div>
      </div>
      <button onClick={() => setSearchRevision((current) => current + 1)} type="button">
        tick
      </button>
      <p data-testid="pdf-search-single-target-status">{`${searchStatus.current}/${searchStatus.total}/${searchTarget ? 'pending' : 'cleared'}`}</p>
    </div>
  );
}

describe('usePdfSearchEffect target jump', () => {
  it('consumes a target jump once so later search recalculations do not scroll back again', async () => {
    const scrollToMock = vi.fn();
    window.HTMLElement.prototype.scrollTo = scrollToMock;

    render(<PdfSearchSingleTargetScrollHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-single-target-status')).toHaveTextContent('1/1/cleared');
    });
    expect(scrollToMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'tick' }));

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-single-target-status')).toHaveTextContent('1/1/cleared');
    });
    expect(scrollToMock).toHaveBeenCalledTimes(1);
  });
});
