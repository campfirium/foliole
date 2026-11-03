export interface ExtractedPdfPage {
  page: number;
  pageHeight: number | null;
  pageWidth: number | null;
  text: string;
}

interface PdfTextPage {
  streamTextContent(): ReadableStream<{ items: unknown[] }>;
  getViewport(input: { scale: number }): { width: number; height: number };
}

/** Desktop and companion preserve the same text-item order and scale-one page dimensions. */
export async function readPdfTextPage(pdfPage: PdfTextPage, page: number, signal?: AbortSignal): Promise<ExtractedPdfPage> {
  signal?.throwIfAborted();
  const reader = pdfPage.streamTextContent().getReader();
  const items: unknown[] = [];
  const abort = () => { void reader.cancel(signal?.reason).catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    for (;;) {
      const chunk = await reader.read();
      signal?.throwIfAborted();
      if (chunk.done) break;
      items.push(...chunk.value.items);
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  const viewport = pdfPage.getViewport({ scale: 1 });
  const validDimensions = Number.isFinite(viewport.width) && viewport.width > 0 &&
    Number.isFinite(viewport.height) && viewport.height > 0;
  return {
    page, pageHeight: validDimensions ? viewport.height : null, pageWidth: validDimensions ? viewport.width : null,
    text: items.map(item => item && typeof item === 'object' && 'str' in item && typeof item.str === 'string' ? item.str : '').join('')
  };
}
