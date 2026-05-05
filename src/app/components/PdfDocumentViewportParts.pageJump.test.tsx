import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import type { PdfJumpRequest } from '../../features/pdf/model/pdfSystemApi';

import { usePageJumpEffect } from './PdfDocumentViewportParts';

function PageJumpHarness({ onJumpHandled, pageJumpRequest }: { onJumpHandled: (requestId: number) => void; pageJumpRequest: PdfJumpRequest | null }) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});

  usePageJumpEffect(pageJumpRequest, pageElementsRef, scrollContainerRef, onJumpHandled);

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

it('triggers page jump effect for repeated requests to the same page', async () => {
  const onJumpHandled = vi.fn();
  const { rerender } = render(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={null} />);

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

  rerender(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 1, page: 5, positionY: 0.2 }} />);
  rerender(<PageJumpHarness onJumpHandled={onJumpHandled} pageJumpRequest={{ id: 2, page: 5, positionY: 0.8 }} />);

  await waitFor(() => expect(scrollToMock).toHaveBeenCalledTimes(2));
  expect(scrollToMock).toHaveBeenNthCalledWith(1, { behavior: 'smooth', top: 250 });
  expect(scrollToMock).toHaveBeenNthCalledWith(2, { behavior: 'smooth', top: 490 });
  expect(onJumpHandled).toHaveBeenNthCalledWith(1, 1);
  expect(onJumpHandled).toHaveBeenNthCalledWith(2, 2);
});
