import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { TEST_ATTACHMENT_HASH } from '../../../test/attachmentResourceTestSupport';
import { providePdfReaderSessionSink, type PdfReaderSessionReport } from '../model/pdfReaderSession';

const pdf = vi.hoisted(() => ({ redrawEveryRender: false }));
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
    // Like react-pdf, a document loads asynchronously and reports one load per file, whatever its callbacks do.
    Document: ({ children, file, onLoadSuccess }: {
      children: import('react').ReactNode; file: string; onLoadSuccess?: (payload: { numPages: number }) => void;
    }) => {
      const latest = React.useRef(onLoadSuccess);
      latest.current = onLoadSuccess;
      React.useEffect(() => {
        let active = true;
        void Promise.resolve().then(() => { if (active) latest.current?.({ numPages: 3 }); });
        return () => { active = false; };
      }, [file]);
      return <div data-file={file}>{children}</div>;
    },
    Page: ({ onRenderTextLayerSuccess, pageNumber, width }: {
      onRenderTextLayerSuccess?: () => void; pageNumber: number; width?: number;
    }) => {
      React.useLayoutEffect(() => { if (!pdf.redrawEveryRender) onRenderTextLayerSuccess?.(); },
        [onRenderTextLayerSuccess, pageNumber, width]);
      // A regressed text layer that redraws on every render at the same width.
      React.useLayoutEffect(() => { if (pdf.redrawEveryRender) onRenderTextLayerSuccess?.(); });
      return <div data-width={width}>PDF page {pageNumber}</div>;
    },
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: 'test' }
  };
});

import { SimplePdfDocument } from './SimplePdfDocument';

const reports: PdfReaderSessionReport[] = [];

beforeEach(() => {
  pdf.redrawEveryRender = false;
  reports.length = 0;
  providePdfReaderSessionSink(report => reports.push(report));
  resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({ status: 'ready', resource_url: 'capacitor://pdf-file' });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
  globalThis.ResizeObserver = class { disconnect() {} observe() {} unobserve() {} };
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.getBoundingClientRect = vi.fn(() => new DOMRect(0, 0, 400, 600));
});

afterEach(() => {
  providePdfReaderSessionSink(undefined);
  vi.restoreAllMocks();
});

async function openReader() {
  const reader = <SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} onMissingResource={vi.fn()} title="Paper" />;
  const view = renderWithLocalization(reader);
  await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
  for (let render = 0; render < 5; render++) view.rerender(reader);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  return view;
}

it('reports one load and no in-place redraws for a reader that re-renders and zooms', async () => {
  const view = await openReader();
  fireEvent.click(screen.getByRole('button', { name: '+' }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(reports).toEqual([]);
  view.unmount();

  expect(reports).toEqual([expect.objectContaining({ sourceResolutions: 1, documentLoads: 1, textLayerRebuilds: 0,
    firstPageMs: expect.any(Number) })]);
  expect(reports[0]!.textLayerRenders).toBeGreaterThan(0);
});

it('counts a text layer redrawn at the same width by the same page', async () => {
  pdf.redrawEveryRender = true;
  const view = await openReader();
  view.unmount();
  expect(reports[0]!.textLayerRebuilds).toBeGreaterThan(0);
  expect(reports[0]!.documentLoads).toBe(1);
});
