import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { TEST_ATTACHMENT_HASH } from '../../../test/attachmentResourceTestSupport';

const resourceMock = vi.hoisted(() => ({
  pages: 2,
  invalidateAttachmentResourceResolution: vi.fn(),
  resolveRuntimeAttachmentResource: vi.fn()
}));

vi.mock('../../../shared/platform/attachmentResources', () => resourceMock);

vi.mock('../model/pdfAutoCrop', () => ({
  measurePdfTextLayerCropBox: () => ({ bottom: 100, left: 10, right: 90, top: 0 }),
  resolvePdfCropScale: () => 1
}));

vi.mock('react-pdf', async () => {
  const React = await import('react');
  return {
    Document: ({ children, onLoadSuccess }: { children: import('react').ReactNode; onLoadSuccess?: (payload: { numPages: number }) => void }) => {
      React.useEffect(() => { onLoadSuccess?.({ numPages: resourceMock.pages }); }, [onLoadSuccess]);
      return <div>{children}</div>;
    },
    Page: ({ onRenderTextLayerSuccess, pageNumber, rotate, width }: { onRenderTextLayerSuccess?: () => void; pageNumber: number; rotate?: number; width?: number }) => {
      const callbackRef = React.useRef(onRenderTextLayerSuccess);
      callbackRef.current = onRenderTextLayerSuccess;
      React.useEffect(() => { callbackRef.current?.(); }, [pageNumber, rotate, width]);
      return <div data-rotate={rotate ?? 0}>PDF page {pageNumber}</div>;
    },
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: 'test' }
  };
});

import { SimplePdfDocument } from './SimplePdfDocument';

beforeEach(() => {
  vi.clearAllMocks();
  resourceMock.pages = 2;
  resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({ resource_url: 'capacitor://pdf-file', status: 'ready' });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
  globalThis.ResizeObserver = class { disconnect() {} observe() {} unobserve() {} };
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.getBoundingClientRect = vi.fn(() => new DOMRect(0, 0, 400, 600));
});

afterEach(() => vi.restoreAllMocks());

function typePage(value: string) {
  const input = screen.getByRole('textbox', { name: 'PDF page' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest('form')!);
}

it('jumps straight to a typed page, clamps it to the document and saves the new position', async () => {
  resourceMock.pages = 10000;
  const onChange = vi.fn();
  renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} positionPersistence={{ onChange }} title="Long paper" />);
  await screen.findByText('PDF page 1');
  expect(screen.getByRole('textbox', { name: 'PDF page' })).toHaveValue('1');
  expect(screen.getByText('/ 10000')).toBeInTheDocument();

  typePage('9000');
  await waitFor(() => expect(document.querySelector('[data-pdf-page="9000"]')).toBeInTheDocument());
  expect(document.querySelector('[data-pdf-page="4500"]')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'PDF page' })).toHaveValue('9000');
  expect(onChange).toHaveBeenCalledWith({ page: 9000, fraction: 0 });

  typePage('123456');
  await waitFor(() => expect(document.querySelector('[data-pdf-page="10000"]')).toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: 'PDF page' })).toHaveValue('10000');
  // Jump targets are not search results, so no page is marked as the requested one.
  expect(document.querySelector('[aria-current="page"]')).toBeNull();
});

it('repeats a jump to the same page and ignores an empty page entry', async () => {
  resourceMock.pages = 50;
  renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} title="Paper" />);
  await screen.findByText('PDF page 1');
  typePage('30');
  await waitFor(() => expect(document.querySelector('[data-pdf-page="30"]')).toBeInTheDocument());
  const scrolls = vi.mocked(HTMLElement.prototype.scrollTo).mock.calls.length;
  typePage('30');
  await waitFor(() => expect(vi.mocked(HTMLElement.prototype.scrollTo).mock.calls.length).toBeGreaterThan(scrolls));
  typePage('');
  expect(screen.getByRole('textbox', { name: 'PDF page' })).toHaveValue('30');
});

it('rotates every page clockwise in quarter turns and shows rotated pages uncropped', async () => {
  renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} title="Scan" />);
  await screen.findByText('PDF page 1');
  const pageBox = () => document.querySelector<HTMLElement>('[data-pdf-page="1"]')!;
  await waitFor(() => expect(pageBox().style.width).toBe('80px'));

  const rotate = screen.getByRole('button', { name: 'Rotate page clockwise' });
  fireEvent.click(rotate);
  await waitFor(() => expect(screen.getByText('PDF page 1')).toHaveAttribute('data-rotate', '90'));
  expect(screen.getByText('PDF page 2')).toHaveAttribute('data-rotate', '90');
  expect(pageBox().style.width).toBe('312px');

  fireEvent.click(rotate);
  fireEvent.click(rotate);
  fireEvent.click(rotate);
  await waitFor(() => expect(screen.getByText('PDF page 1')).toHaveAttribute('data-rotate', '0'));
});
