import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { TEST_ATTACHMENT_HASH } from '../../../test/attachmentResourceTestSupport';

// Work-amplification check WA-047: counts only, never durations.
const counts = vi.hoisted(() => ({ documentLoads: 0, textLayerBuilds: 0 }));
const resourceMock = vi.hoisted(() => ({
  invalidateAttachmentResourceResolution: vi.fn(),
  resolveRuntimeAttachmentResource: vi.fn()
}));

vi.mock('../../../shared/platform/attachmentResources', () => resourceMock);
vi.mock('../model/pdfAutoCrop', () => ({
  measurePdfTextLayerCropBox: () => ({ bottom: 100, left: 0, right: 100, top: 0 }),
  resolvePdfCropScale: () => 1
}));

vi.mock('react-pdf', async () => {
  const React = await import('react');
  return {
    Document: ({ children, file, onLoadSuccess }: {
      children: import('react').ReactNode; file: string; onLoadSuccess?: (payload: { numPages: number }) => void;
    }) => {
      React.useEffect(() => { counts.documentLoads += 1; }, [file]);
      // Like the shared mock, report pages after each parent render; the reader resets its count per source.
      React.useEffect(() => { onLoadSuccess?.({ numPages: 3 }); }, [onLoadSuccess]);
      return <div data-file={file}>{children}</div>;
    },
    // Mirrors react-pdf 11 TextLayer: the build effect depends on the success callback identity.
    Page: ({ onRenderTextLayerSuccess, pageNumber, width }: {
      onRenderTextLayerSuccess?: () => void; pageNumber: number; width?: number;
    }) => {
      React.useLayoutEffect(() => {
        counts.textLayerBuilds += 1;
        onRenderTextLayerSuccess?.();
      }, [onRenderTextLayerSuccess, pageNumber, width]);
      return <div data-width={width}>PDF page {pageNumber}</div>;
    },
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: 'test' }
  };
});

import { SimplePdfDocument } from './SimplePdfDocument';

beforeEach(() => {
  counts.documentLoads = 0;
  counts.textLayerBuilds = 0;
  resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({ status: 'ready', resource_url: 'capacitor://pdf-file' });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
  globalThis.ResizeObserver = class { disconnect() {} observe() {} unobserve() {} };
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.getBoundingClientRect = vi.fn(() => new DOMRect(0, 0, 400, 600));
});

afterEach(() => vi.restoreAllMocks());

it('does not rebuild PDF text layers when the reader re-renders with unchanged input', async () => {
  const view = renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} onMissingResource={vi.fn()} title="Paper" />);
  await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  const settled = { ...counts };
  expect(settled.textLayerBuilds).toBeGreaterThan(0);

  for (let render = 0; render < 10; render++) {
    view.rerender(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} onMissingResource={vi.fn()} title="Paper" />);
  }
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(counts).toEqual(settled);

  // Control: a new width must rebuild the text layers, so the counter is live.
  fireEvent.click(screen.getByRole('button', { name: '+' }));
  await waitFor(() => expect(counts.textLayerBuilds).toBeGreaterThan(settled.textLayerBuilds));
  expect(counts.documentLoads).toBe(settled.documentLoads);
});
