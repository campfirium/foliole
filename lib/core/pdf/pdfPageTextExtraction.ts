export interface ExtractedPdfPage {
  page: number;
  pageHeight: number | null;
  pageWidth: number | null;
  text: string;
}

interface PdfTextPage {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(input: { scale: number }): { width: number; height: number };
}

/** Desktop and companion preserve the same text-item order and scale-one page dimensions. */
export async function readPdfTextPage(pdfPage: PdfTextPage, page: number): Promise<ExtractedPdfPage> {
  const content = await pdfPage.getTextContent();
  const viewport = pdfPage.getViewport({ scale: 1 });
  const validDimensions = Number.isFinite(viewport.width) && viewport.width > 0 &&
    Number.isFinite(viewport.height) && viewport.height > 0;
  return {
    page, pageHeight: validDimensions ? viewport.height : null, pageWidth: validDimensions ? viewport.width : null,
    text: content.items.map(item => item && typeof item === 'object' && 'str' in item && typeof item.str === 'string' ? item.str : '').join('')
  };
}
