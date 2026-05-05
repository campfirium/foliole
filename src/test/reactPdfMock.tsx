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
    Page: ({ pageNumber, rotate, scale }: { pageNumber: number; rotate?: number; scale: number }) => (
      <div data-page={pageNumber} data-rotate={rotate ?? 0} data-scale={scale} data-testid="pdf-document-page">
        <div className="textLayer">
          <span>{`keyword match on page ${pageNumber}`}</span>
        </div>
      </div>
    ),
    pdfjs: {
      version: '5.4.296',
      GlobalWorkerOptions: mockPdfWorkerOptions
    }
  };
});
