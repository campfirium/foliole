import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { TEST_ATTACHMENT_HASH } from '../../../test/attachmentResourceTestSupport';

const resourceMock = vi.hoisted(() => ({
  pages: 2,
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
    children: import('react').ReactNode;
    file: string;
    onLoadSuccess?: (payload: { numPages: number }) => void;
  }) => {
    React.useEffect(() => {
      onLoadSuccess?.({ numPages: resourceMock.pages });
    }, [onLoadSuccess]);
    return <div data-file={file}>{children}</div>;
  },
  Page: ({ onRenderTextLayerSuccess, pageNumber, width }: {
    onRenderTextLayerSuccess?: () => void;
    pageNumber: number;
    width?: number;
  }) => {
    const callbackRef = React.useRef(onRenderTextLayerSuccess);
    callbackRef.current = onRenderTextLayerSuccess;
    React.useEffect(() => {
      callbackRef.current?.();
    }, [pageNumber, width]);
    return <div data-width={width}>PDF page {pageNumber}</div>;
  },
  pdfjs: {
    GlobalWorkerOptions: { workerSrc: '' },
    version: 'test'
  }
  };
});

import { SimplePdfDocument } from './SimplePdfDocument';

beforeEach(() => {
  vi.clearAllMocks();
  resourceMock.pages = 2;
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
    return new DOMRect(0, 0, 400, 600);
  });
});

afterEach(() => vi.restoreAllMocks());

describe('SimplePdfDocument', () => {
  it('renders a canonical PDF without registering any attachment descriptions', async () => {
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({
      resource_url: 'capacitor://pdf-file',
      status: 'ready'
    });

    renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} title="Paper" />);

    await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
    expect(document.querySelector('[data-pdf-page="2"]')).toBeInTheDocument();
    expect(resourceMock.resolveRuntimeAttachmentResource).toHaveBeenCalledWith(`asset://${TEST_ATTACHMENT_HASH}.pdf`);
  });

  it('offers a lightweight original PDF viewer with explicit zoom controls', async () => {
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({
      resource_url: 'capacitor://pdf-file',
      status: 'ready'
    });

    renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} onBackToText={vi.fn()} title="Paper" />);

    await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
    expect(screen.getByText('100%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+' }));

    expect(screen.getByText('120%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument();
  });

  it('jumps to a requested search page without changing persisted reading state', async () => {
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({
      resource_url: 'capacitor://pdf-file',
      status: 'ready'
    });

    renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} initialPage={2} title="Paper" />);

    await waitFor(() => expect(document.querySelector('[data-pdf-page="2"]')).toBeInTheDocument());
    await waitFor(() => expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled());
    expect(document.querySelector('[data-pdf-page="2"]')).toHaveAttribute('aria-current', 'page');

    expect(document.querySelector('[data-pdf-page="2"] > span')).toHaveTextContent('PDF page 2');
  });

  it('keeps a long PDF window bounded while immediately including a deep search target', async () => {
    resourceMock.pages = 10000;
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({ resource_url: 'capacitor://pdf-file', status: 'ready' });
    const view = renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} initialPage={9000} title="Long paper" />);
    await waitFor(() => expect(document.querySelector('[data-pdf-page="9000"]')).toBeInTheDocument());
    expect(document.querySelectorAll('[data-pdf-page]').length).toBeLessThan(30);
    expect(document.querySelector('[data-pdf-page="4500"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    await waitFor(() => expect(document.querySelector('[data-pdf-page="9000"]')).toBeInTheDocument());
    expect(document.querySelectorAll('[data-pdf-page]').length).toBeLessThan(30);
    view.unmount();
    expect(document.querySelectorAll('[data-pdf-page]')).toHaveLength(0);
  });

  it('retries resolving after the caller syncs a missing PDF resource', async () => {
    const syncMissing = vi.fn(async () => undefined);
    resourceMock.resolveRuntimeAttachmentResource
      .mockResolvedValueOnce({ resource_url: null, status: 'missing_file' })
      .mockResolvedValueOnce({ resource_url: 'capacitor://pdf-file', status: 'ready' });

    renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} onMissingResource={syncMissing} title="Paper" />);

    await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
    expect(syncMissing).toHaveBeenCalledWith(TEST_ATTACHMENT_HASH);
    expect(resourceMock.invalidateAttachmentResourceResolution).toHaveBeenCalledWith(`${TEST_ATTACHMENT_HASH}.pdf`);
    expect(resourceMock.resolveRuntimeAttachmentResource).toHaveBeenCalledTimes(2);
  });
});

it.each([
  { requestedPage: 2, savedPage: 1, expectedPage: 2, expectedTop: 100 },
  { requestedPage: 2, savedPage: 2, expectedPage: 2, expectedTop: 100 },
  { requestedPage: undefined, savedPage: 2, expectedPage: 2, expectedTop: 400 }
])('opens page $expectedPage at $expectedTop from search target $requestedPage and saved page $savedPage',
  async ({ requestedPage, savedPage, expectedPage, expectedTop }) => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, this.hasAttribute('data-list-position-index') ? 100 : 0, 400, 600);
    });
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({
      resource_url: 'capacitor://pdf-file', status: 'ready'
    });
    renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} title="Paper"
      {...(requestedPage === undefined ? {} : { initialPage: requestedPage })}
      positionPersistence={{ initial: { page: savedPage, fraction: 0.5 } }} />);
    await waitFor(() => expect(document.querySelector(`[data-pdf-page="${expectedPage}"]`)).toHaveAttribute('aria-current', 'page'));
    await waitFor(() => expect(HTMLElement.prototype.scrollTo).toHaveBeenLastCalledWith({ top: expectedTop }));
  });


describe('SimplePdfDocument unavailable state', () => {
  it('keeps the return action available when the PDF file is unavailable', async () => {
    const onBack = vi.fn();
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({ resource_url: null, status: 'missing_file' });

    renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} onBackToText={onBack} title="Missing" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Text' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('PDF file unavailable')).toBeInTheDocument();
  });
});

it('rejects a noncanonical PDF identity without resolving or downloading it', async () => {
  const syncMissing = vi.fn();
  renderWithLocalization(<SimplePdfDocument attachmentId="invalid-pdf" onMissingResource={syncMissing} title="Invalid" />);
  expect(await screen.findByText('PDF file unavailable')).toBeInTheDocument();
  expect(resourceMock.resolveRuntimeAttachmentResource).not.toHaveBeenCalled();
  expect(syncMissing).not.toHaveBeenCalled();
});

it('ignores a late PDF resolution after switching to another attachment', async () => {
  let finish!: (value: { status: string; resource_url: string }) => void;
  resourceMock.resolveRuntimeAttachmentResource.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ status: 'ready', resource_url: 'capacitor://current.pdf' });
  const view = renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} title="Old" />);
  view.rerender(<SimplePdfDocument attachmentId={'b'.repeat(64)} title="Current" />);
  await waitFor(() => expect(document.querySelector('[data-file]')).toHaveAttribute('data-file', 'capacitor://current.pdf'));
  await act(async () => { finish({ status: 'ready', resource_url: 'capacitor://old.pdf' }); });
  expect(resourceMock.resolveRuntimeAttachmentResource).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[data-file]')).toHaveAttribute('data-file', 'capacitor://current.pdf');
});

it('keeps the open PDF when the parent passes a new missing-resource callback', async () => {
  resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({ status: 'ready', resource_url: 'capacitor://pdf-file' });
  const view = renderWithLocalization(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} onMissingResource={vi.fn()} title="Paper" />);
  await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
  const document = screen.getByText('PDF page 1').closest('[data-file]');
  for (let render = 0; render < 3; render++) {
    view.rerender(<SimplePdfDocument attachmentId={TEST_ATTACHMENT_HASH} onMissingResource={vi.fn()} title="Paper" />);
  }
  await act(async () => { await Promise.resolve(); });
  expect(resourceMock.resolveRuntimeAttachmentResource).toHaveBeenCalledTimes(1);
  expect(screen.getByText('PDF page 1').closest('[data-file]')).toBe(document);
});
