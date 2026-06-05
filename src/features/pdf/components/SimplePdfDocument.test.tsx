import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

const resourceMock = vi.hoisted(() => ({
  invalidateAttachmentResourceResolution: vi.fn(),
  resolveRuntimeAttachmentResource: vi.fn()
}));

vi.mock('../../../shared/platform/attachmentResources', () => resourceMock);

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
  Page: ({ pageNumber, width }: { pageNumber: number; width?: number }) => <div data-width={width}>PDF page {pageNumber}</div>,
  pdfjs: {
    GlobalWorkerOptions: { workerSrc: '' },
    version: 'test'
  }
  };
});

import { SimplePdfDocument } from './SimplePdfDocument';

describe('SimplePdfDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.ResizeObserver = class {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
  });

  it('resolves the attachment resource before rendering the continuous PDF pages', async () => {
    resourceMock.resolveRuntimeAttachmentResource.mockResolvedValue({
      resource_url: 'capacitor://pdf-file',
      status: 'ready'
    });

    renderWithLocalization(<SimplePdfDocument attachmentId="pdf-attachment-1" title="Paper" />);

    await waitFor(() => expect(screen.getByText('PDF page 1')).toBeInTheDocument());
    expect(screen.getByText('PDF page 2')).toBeInTheDocument();
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
