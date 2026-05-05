import { vi } from 'vitest';

export const mockPdfWorkerOptions = {
  workerSrc: ''
};

vi.mock('react-pdf', async () => {
  const React = await import('react');
  return {
    Document: ({
      children,
      file,
      onLoadSuccess
    }: {
      children: React.ReactNode;
      file?: string;
      onLoadSuccess?: (payload: { numPages: number }) => void;
    }) => {
      React.useEffect(() => {
        onLoadSuccess?.({ numPages: 9 });
      }, [file, onLoadSuccess]);
      return (
        <div data-file={file} data-testid="pdf-document-view">
          {children}
        </div>
      );
    },
    Page: ({
      pageNumber,
      rotate,
      scale,
      width,
      onLoadSuccess,
      onGetTextSuccess
    }: {
      onLoadSuccess?: (page: { getViewport: (input: { scale: number }) => { width: number } }) => void;
      onGetTextSuccess?: (payload: { items: Array<{ str: string }> }) => void;
      pageNumber: number;
      rotate?: number;
      scale?: number;
      width?: number;
    }) => {
      React.useEffect(() => {
        onLoadSuccess?.({
          getViewport: ({ scale: nextScale }: { scale: number }) => ({ width: 800 * nextScale })
        });
        onGetTextSuccess?.({ items: [{ str: `keyword match on page ${pageNumber}` }] });
      }, [onGetTextSuccess, onLoadSuccess, pageNumber]);
      return (
        <div data-page={pageNumber} data-rotate={rotate ?? 0} data-scale={scale ?? 1} data-width={width ?? ''} data-testid="pdf-document-page">
          <div className="textLayer">
            <span role="presentation">{`keyword match on page ${pageNumber}`}</span>
          </div>
        </div>
      );
    },
    pdfjs: {
      version: '5.4.296',
      GlobalWorkerOptions: mockPdfWorkerOptions
    }
  };
});
