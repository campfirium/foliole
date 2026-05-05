import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { usePdfSearchEffect } from './PdfDocumentSearch';

function PdfSearchLateTextLayerHarness() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, string>>({});
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [searchRevision, setSearchRevision] = useState(0);
  const [textReady, setTextReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      pageTextByNumberRef.current[1] = 'keyword appears after text layer render';
      setSearchRevision((current) => current + 1);
      setTextReady(true);
    }, 20);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  usePdfSearchEffect({
    onSearchStatusChange: setSearchStatus,
    pageElementsRef,
    pageTextByNumberRef,
    scrollContainerRef,
    searchQuery: 'keyword',
    searchRequest: null,
    searchTarget: null,
    searchRevision,
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

function PdfSearchSingleRequestHarness() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, string>>({ 1: 'keyword keyword' });
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [searchRevision, setSearchRevision] = useState(0);
  const [searchRequest, setSearchRequest] = useState<{ direction: 'next'; id: number } | null>(null);

  usePdfSearchEffect({
    onSearchStatusChange: setSearchStatus,
    pageElementsRef,
    pageTextByNumberRef,
    scrollContainerRef,
    searchQuery: 'keyword',
    searchRequest,
    searchTarget: null,
    searchRevision,
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
        <div className="textLayer">
          <span role="presentation">keyword</span>
          <span role="presentation"> keyword</span>
        </div>
      </div>
      <button onClick={() => setSearchRevision((current) => current + 1)} type="button">
        tick
      </button>
      <button onClick={() => setSearchRequest({ direction: 'next', id: 7 })} type="button">
        request-next
      </button>
      <p data-testid="pdf-search-single-request-status">{`${searchStatus.current}/${searchStatus.total}`}</p>
    </div>
  );
}

function PdfSearchLinkedEntryHarness() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const pageTextByNumberRef = useRef<Record<number, string>>({
    1: 'keyword bridge',
    2: 'keyword bridge keyword'
  });
  const [searchStatus, setSearchStatus] = useState({ current: 0, hasQuery: false, total: 0 });
  const [searchRevision] = useState(1);
  const [searchRequest, setSearchRequest] = useState<{ direction: 'next'; id: number } | null>(null);
  const [searchTarget, setSearchTarget] = useState<{ id: number; matchStart: number; page: number } | null>(null);

  usePdfSearchEffect({
    onSearchStatusChange: setSearchStatus,
    pageElementsRef,
    pageTextByNumberRef,
    scrollContainerRef,
    searchQuery: 'keyword',
    searchRequest,
    searchTarget,
    searchRevision,
    totalPages: 2
  });

  return (
    <div ref={scrollContainerRef}>
      <div data-pdf-page-number="1" ref={(element) => { pageElementsRef.current[1] = element; }}>
        <div className="textLayer"><span role="presentation">keyword bridge</span></div>
      </div>
      <div data-pdf-page-number="2" ref={(element) => { pageElementsRef.current[2] = element; }}>
        <div className="textLayer"><span role="presentation">keyword bridge keyword</span></div>
      </div>
      <button onClick={() => setSearchTarget({ id: 1, matchStart: 'keyword bridge keyword'.lastIndexOf('keyword'), page: 2 })} type="button">
        global-open
      </button>
      <button onClick={() => setSearchRequest({ direction: 'next', id: 1 })} type="button">
        toolbar-next
      </button>
      <p data-testid="pdf-search-linked-entry-status">{`${searchStatus.current}/${searchStatus.total}`}</p>
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

  it('applies the same next-request id only once even if search recalculates again', async () => {
    render(<PdfSearchSingleRequestHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-single-request-status')).toHaveTextContent('1/2');
    });

    fireEvent.click(screen.getByRole('button', { name: 'request-next' }));
    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-single-request-status')).toHaveTextContent('2/2');
      expect(document.querySelectorAll('.textLayer span[data-pdf-search-hit="active"]')).toHaveLength(1);
      expect(document.querySelectorAll('.textLayer span[data-pdf-search-hit="match"]')).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'tick' }));

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-single-request-status')).toHaveTextContent('2/2');
      expect(document.querySelectorAll('.textLayer span[data-pdf-search-hit="active"]')).toHaveLength(1);
    });
  });

  it('keeps one shared match sequence when global entry target and toolbar next are chained', async () => {
    render(<PdfSearchLinkedEntryHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-linked-entry-status')).toHaveTextContent('1/3');
    });

    fireEvent.click(screen.getByRole('button', { name: 'global-open' }));
    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-linked-entry-status')).toHaveTextContent('3/3');
    });

    fireEvent.click(screen.getByRole('button', { name: 'toolbar-next' }));
    await waitFor(() => {
      expect(screen.getByTestId('pdf-search-linked-entry-status')).toHaveTextContent('1/3');
    });
  });
});
