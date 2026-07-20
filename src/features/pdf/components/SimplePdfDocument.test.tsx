import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

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
    children: import('react').ReactNode;
    file: string;
    onLoadSuccess?: (payload: { numPages: number }) => void;
  }) => {
    React.useEffect(() => {
      onLoadSuccess?.({ numPages: 2 });
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
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
    return { top: this.dataset.pdfPage === '2' ? 100 : 0 } as DOMRect;
  });
});

describe('SimplePdfDocument', () => {
  it('resolves the attachment resource before rendering the continuous PDF pages', async () => {
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({
      resource_url: 'capacitor://pdf-file',
      status: 'ready'
    });

    renderWithLocalization(<SimplePdfDocument attachmentId="pdf-attachment-1" title="Paper" />);

    await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
    expect(document.querySelector('[data-pdf-page="2"]')).toBeInTheDocument();
    expect(resourceMock.resolveRuntimeAttachmentResource).toHaveBeenCalledWith('asset://pdf-attachment-1');
  });

  it('offers a lightweight original PDF viewer with explicit zoom controls', async () => {
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({
      resource_url: 'capacitor://pdf-file',
      status: 'ready'
    });

    renderWithLocalization(<SimplePdfDocument attachmentId="pdf-attachment-1" onBackToText={vi.fn()} title="Paper" />);

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

    renderWithLocalization(<SimplePdfDocument attachmentId="pdf-attachment-1" initialPage={2} title="Paper" />);

    await waitFor(() => expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 100 }));
    expect(document.querySelector('[data-pdf-page="2"]')).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-pdf-page="1"]')).not.toHaveAttribute('aria-current');
    expect(document.querySelector('[data-pdf-page="2"] > span')).toHaveTextContent('PDF page 2');
  });

  it('retries resolving after the caller syncs a missing PDF resource', async () => {
    const syncMissing = vi.fn(async () => undefined);
    resourceMock.resolveRuntimeAttachmentResource
      .mockResolvedValueOnce({ resource_url: null, status: 'missing_file' })
      .mockResolvedValueOnce({ resource_url: 'capacitor://pdf-file', status: 'ready' });

    renderWithLocalization(<SimplePdfDocument attachmentId="pdf-attachment-1" onMissingResource={syncMissing} title="Paper" />);

    await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
    expect(syncMissing).toHaveBeenCalledWith('pdf-attachment-1');
    expect(resourceMock.invalidateAttachmentResourceResolution).toHaveBeenCalledWith('pdf-attachment-1');
    expect(resourceMock.resolveRuntimeAttachmentResource).toHaveBeenCalledTimes(2);
  });
});

describe('SimplePdfDocument unavailable state', () => {
  it('keeps the return action available when the PDF file is unavailable', async () => {
    const onBack = vi.fn();
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({ resource_url: null, status: 'missing_file' });

    renderWithLocalization(<SimplePdfDocument attachmentId="missing-pdf" onBackToText={onBack} title="Missing" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Text' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('PDF file unavailable')).toBeInTheDocument();
  });
});
