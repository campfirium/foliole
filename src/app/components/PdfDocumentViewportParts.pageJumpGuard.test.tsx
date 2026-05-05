import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import { usePageJumpEffect, useVisiblePageSync } from './PdfDocumentViewportParts';

function PendingJumpHarness(props: { onVisibleLocation: (page: number, positionY: number) => void }) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const handleScroll = useVisiblePageSync({ id: 9, page: 2, positionY: 0 }, pageElementsRef, scrollContainerRef, props.onVisibleLocation, 3);

  usePageJumpEffect({ id: 9, page: 2, positionY: 0 }, pageElementsRef, scrollContainerRef, 3, () => undefined);

  return (
    <div data-testid="pending-jump-scroll-container" onScroll={handleScroll} ref={scrollContainerRef}>
      {[1, 2, 3].map((pageNumber) => (
        <div
          data-pdf-page-state={pageNumber === 2 ? 'placeholder' : 'ready'}
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

function prepareScrollContainer(scrollContainer: HTMLDivElement) {
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
}

it('keeps visible page sync locked while a placeholder jump is still pending', () => {
  const onVisibleLocation = vi.fn();

  render(<PendingJumpHarness onVisibleLocation={onVisibleLocation} />);

  const scrollContainer = screen.getByTestId('pending-jump-scroll-container') as HTMLDivElement;
  prepareScrollContainer(scrollContainer);

  scrollContainer.scrollTop = 0;
  scrollContainer.dispatchEvent(new Event('scroll'));

  expect(onVisibleLocation).not.toHaveBeenCalled();
});
