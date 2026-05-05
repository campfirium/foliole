import { render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import { usePageJumpEffect, useVisiblePageSync } from './PdfDocumentViewportParts';

function PageJumpHarness({
  mountTargetLater = false,
  onJumpHandled,
  pageJumpRequest,
  targetState = 'ready',
  totalPages
}: {
  mountTargetLater?: boolean;
  onJumpHandled: (requestId: number) => void;
  pageJumpRequest: PdfJumpRequest | null;
  targetState?: 'placeholder' | 'ready';
  totalPages: number | null;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const [isTargetMounted, setIsTargetMounted] = useState(!mountTargetLater);

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, totalPages, onJumpHandled);

  useEffect(() => {
    if (!mountTargetLater) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setIsTargetMounted(true);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mountTargetLater]);

  return (
    <div data-testid="pdf-scroll-container" ref={scrollContainerRef}>
      {isTargetMounted ? (
        <div
          data-testid="pdf-page-target"
          data-pdf-page-state={targetState}
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
      ) : null}
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
  const [activePageJumpRequest, setActivePageJumpRequest] = useState(pageJumpRequest);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const handleScroll = useVisiblePageSync(activePageJumpRequest, pageElementsRef, scrollContainerRef, onVisibleLocation, 3);

  usePageJumpEffect(activePageJumpRequest, pageElementsRef, scrollContainerRef, 3, () => {
    setActivePageJumpRequest(null);
  });

  return (
    <div data-testid="pdf-visible-page-scroll-container" onScroll={handleScroll} ref={scrollContainerRef}>
      {[1, 2, 3].map((pageNumber) => (
        <div
          data-pdf-page-state="ready"
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
  expect(scrollToMock).toHaveBeenNthCalledWith(1, { behavior: 'auto', top: 250 });
  expect(scrollToMock).toHaveBeenNthCalledWith(2, { behavior: 'auto', top: 490 });
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

it('keeps watching until the target page shell mounts', async () => {
  const onJumpHandled = vi.fn();
  render(<PageJumpHarness mountTargetLater onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 8, page: 5, positionY: 0.5 }} totalPages={9} />);

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

  await waitFor(() => expect(scrollToMock).toHaveBeenCalledWith({ behavior: 'auto', top: 370 }));
  expect(onJumpHandled).toHaveBeenCalledWith(8);
});

it('waits for the real rendered page before handling the jump', async () => {
  const onJumpHandled = vi.fn();
  const { rerender } = render(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={null} targetState="placeholder" totalPages={9} />);

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

  rerender(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 5, page: 5, positionY: 0.5 }} targetState="placeholder" totalPages={9} />);

  await waitFor(() => {
    expect(scrollToMock).toHaveBeenCalledWith({ behavior: 'auto', top: 370 });
  });
  expect(onJumpHandled).not.toHaveBeenCalled();

  rerender(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 5, page: 5, positionY: 0.5 }} targetState="ready" totalPages={9} />);

  await waitFor(() => expect(scrollToMock).toHaveBeenCalledTimes(2));
  expect(scrollToMock).toHaveBeenLastCalledWith({ behavior: 'auto', top: 370 });
  expect(onJumpHandled).toHaveBeenCalledWith(5);
});

it('resumes visible page updates after the jump request has been handled', async () => {
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
  expect(onVisibleLocation).toHaveBeenCalledWith(1, 0.175);

  scrollContainer.scrollTop = 600;
  scrollContainer.dispatchEvent(new Event('scroll'));

  await waitFor(() => expect(onVisibleLocation).toHaveBeenCalledWith(2, 0.175));
});
