import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import { usePageJumpEffect, useVisiblePageSync } from './PdfDocumentViewportParts';

function PageJumpHarness({
  onJumpHandled,
  pageJumpRequest,
  totalPages
}: {
  onJumpHandled: (requestId: number) => void;
  pageJumpRequest: PdfJumpRequest | null;
  totalPages: number | null;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const programmaticPageJumpRef = useRef<{ expiresAt: number; requestId: number; targetPage: number } | null>(null);

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, totalPages, onJumpHandled, programmaticPageJumpRef);

  return (
    <div data-testid="pdf-scroll-container" ref={scrollContainerRef}>
      <div
        data-testid="pdf-page-target"
        ref={(element) => {
          pageElementsRef.current[5] = element;
          if (element) {
            Object.defineProperty(element, 'offsetTop', {
              configurable: true,
              value: 240
            });
            Object.defineProperty(element, 'clientHeight', {
              configurable: true,
              value: 400
            });
          }
        }}
      />
    </div>
  );
}

function VisiblePageSyncHarness({
  onVisibleLocation,
  pageJumpRequest
}: {
  onVisibleLocation: (page: number, positionY: number) => void;
  pageJumpRequest: PdfJumpRequest | null;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const programmaticPageJumpRef = useRef<{ expiresAt: number; requestId: number; targetPage: number } | null>(null);
  const handleScroll = useVisiblePageSync(pageElementsRef, scrollContainerRef, onVisibleLocation, 3, programmaticPageJumpRef);

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, 3, () => undefined, programmaticPageJumpRef);

  return (
    <div data-testid="pdf-visible-page-scroll-container" onScroll={handleScroll} ref={scrollContainerRef}>
      {[1, 2, 3].map((pageNumber) => (
        <div
          data-testid={`pdf-visible-page-${pageNumber}`}
          key={pageNumber}
          ref={(element) => {
            pageElementsRef.current[pageNumber] = element;
            if (element) {
              Object.defineProperty(element, 'offsetTop', {
                configurable: true,
                value: (pageNumber - 1) * 600
              });
              Object.defineProperty(element, 'clientHeight', {
                configurable: true,
                value: 400
              });
            }
          }}
        />
      ))}
    </div>
  );
}

it('triggers page jump effect for repeated requests to the same page', async () => {
  const onJumpHandled = vi.fn();
  const { rerender } = render(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={null} totalPages={null} />);

  const scrollContainer = screen.getByTestId('pdf-scroll-container') as HTMLDivElement;
  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    value: 200
  });
  const scrollToMock = vi.fn();
  Object.defineProperty(scrollContainer, 'scrollTo', {
    configurable: true,
    value: scrollToMock
  });

  rerender(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 1, page: 5, positionY: 0.2 }} totalPages={9} />);
  rerender(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 2, page: 5, positionY: 0.8 }} totalPages={9} />);

  await waitFor(() => expect(scrollToMock).toHaveBeenCalledTimes(2));
  expect(scrollToMock).toHaveBeenNthCalledWith(1, { behavior: 'smooth', top: 250 });
  expect(scrollToMock).toHaveBeenNthCalledWith(2, { behavior: 'smooth', top: 490 });
  expect(onJumpHandled).toHaveBeenNthCalledWith(1, 1);
  expect(onJumpHandled).toHaveBeenNthCalledWith(2, 2);
});

it('retries pending jump after document pages become available', async () => {
  const onJumpHandled = vi.fn();
  const { rerender } = render(
    <PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 4, page: 5, positionY: 0.5 }} totalPages={null} />
  );

  const scrollContainer = screen.getByTestId('pdf-scroll-container') as HTMLDivElement;
  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    value: 200
  });
  const scrollToMock = vi.fn();
  Object.defineProperty(scrollContainer, 'scrollTo', {
    configurable: true,
    value: scrollToMock
  });

  rerender(
    <PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 4, page: 5, positionY: 0.5 }} totalPages={9} />
  );

  await waitFor(() => expect(scrollToMock).toHaveBeenCalledTimes(1));
  expect(onJumpHandled).toHaveBeenCalledWith(4);
});

it('ignores intermediate scroll updates until the jump reaches the requested page', async () => {
  const onVisibleLocation = vi.fn();
  render(<VisiblePageSyncHarness onVisibleLocation={onVisibleLocation} pageJumpRequest={{ id: 7, page: 2, positionY: 0 }} />);

  const scrollContainer = screen.getByTestId('pdf-visible-page-scroll-container') as HTMLDivElement;
  Object.defineProperty(scrollContainer, 'clientHeight', {
    configurable: true,
    value: 200
  });
  Object.defineProperty(scrollContainer, 'offsetParent', {
    configurable: true,
    value: document.body
  });
  Object.defineProperty(scrollContainer, 'scrollTo', {
    configurable: true,
    value: ({ top }: { top: number }) => {
      scrollContainer.scrollTop = top;
    }
  });
  Object.defineProperty(scrollContainer, 'scrollTop', {
    configurable: true,
    value: 0,
    writable: true
  });

  scrollContainer.scrollTop = 0;
  scrollContainer.dispatchEvent(new Event('scroll'));
  expect(onVisibleLocation).not.toHaveBeenCalled();

  scrollContainer.scrollTop = 600;
  scrollContainer.dispatchEvent(new Event('scroll'));

  await waitFor(() => expect(onVisibleLocation).toHaveBeenCalledWith(2, 0.175));
});
