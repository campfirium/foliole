import type { PdfPageForMatch } from '../../lib/core/readwise/readwisePdfMatch.js';

import { extractPdfMatchPages, extractPdfPageTextFromFile, type ExtractedPdfPage } from './pdfPageTextExtraction.js';

export type PdfPageTextRequest =
  | { filePath: string; operation: 'page_text' }
  | { bytes: Uint8Array; operation: 'match_pages' };

export interface PdfPageTextResults {
  match_pages: PdfPageForMatch[];
  page_text: ExtractedPdfPage[];
}

/** Runs one pdf.js read; the worker and the in-process test path share this dispatch. */
export function runPdfPageTextRequest<R extends PdfPageTextRequest>(request: R): Promise<PdfPageTextResults[R['operation']]> {
  if (request.operation === 'match_pages') {
    return extractPdfMatchPages(request.bytes) as Promise<PdfPageTextResults[R['operation']]>;
  }
  return extractPdfPageTextFromFile(request.filePath) as Promise<PdfPageTextResults[R['operation']]>;
}
