import * as React from 'react';
import { vi } from 'vitest';

export const mockPdfWorkerOptions = {
  workerSrc: ''
};

function MockDocument({
  children,
  file,
  onLoadSuccess
}: {
  children: React.ReactNode;
  file?: string;
  onLoadSuccess?: (payload: { numPages: number }) => void;
}) {
  React.useEffect(() => {
    onLoadSuccess?.({ numPages: 9 });
  }, [file, onLoadSuccess]);
  return (
    <div data-file={file} data-testid="pdf-document-view">
      {children}
    </div>
  );
}

function MockPage({
  pageNumber,
  rotate,
  scale,
  width,
  onLoadSuccess,
  onRenderSuccess,
  onGetTextSuccess,
  onRenderTextLayerSuccess
}: {
  onLoadSuccess?: (page: { getViewport: (input: { scale: number }) => { width: number } }) => void;
  onRenderSuccess?: () => void;
  onGetTextSuccess?: (payload: { items: Array<{ str: string }> }) => void;
  onRenderTextLayerSuccess?: () => void;
  pageNumber: number;
  rotate?: number;
  scale?: number;
  width?: number;
}) {
  React.useEffect(() => {
    onLoadSuccess?.({
      getViewport: ({ scale: nextScale }: { scale: number }) => ({ width: 800 * nextScale })
    });
    onRenderSuccess?.();
    onGetTextSuccess?.({ items: [{ str: `keyword match on page ${pageNumber}` }] });
    onRenderTextLayerSuccess?.();
  }, [onGetTextSuccess, onLoadSuccess, onRenderSuccess, onRenderTextLayerSuccess, pageNumber]);
  return (
    <div data-page={pageNumber} data-rotate={rotate ?? 0} data-scale={scale ?? 1} data-width={width ?? ''} data-testid="pdf-document-page">
      <div className="textLayer">
        <span role="presentation">{`keyword match on page ${pageNumber}`}</span>
      </div>
    </div>
  );
}

vi.mock('react-pdf', () => {
  return {
    Document: MockDocument,
    Page: MockPage,
    pdfjs: {
      version: '5.4.296',
      GlobalWorkerOptions: mockPdfWorkerOptions
    }
  };
});
