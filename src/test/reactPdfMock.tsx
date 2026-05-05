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
    Page: ({ pageNumber, scale }: { pageNumber: number; scale: number }) => (
      <div data-page={pageNumber} data-scale={scale} data-testid="pdf-document-page" />
    ),
    pdfjs: {
      version: '5.4.296',
      GlobalWorkerOptions: mockPdfWorkerOptions
    }
  };
});
