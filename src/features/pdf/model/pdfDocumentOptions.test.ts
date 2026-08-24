import { describe, expect, it } from 'vitest';

import { PDF_DOCUMENT_OPTIONS } from './pdfDocumentOptions';

describe('PDF document options', () => {
  it('provides every external PDF.js resource family from the renderer base URL', () => {
    expect(PDF_DOCUMENT_OPTIONS).toEqual({
      cMapPacked: true,
      cMapUrl: new URL('./pdfjs-resources/cmaps/', document.baseURI).toString(),
      iccUrl: new URL('./pdfjs-resources/iccs/', document.baseURI).toString(),
      standardFontDataUrl: new URL('./pdfjs-resources/standard_fonts/', document.baseURI).toString(),
      wasmUrl: new URL('./pdfjs-resources/wasm/', document.baseURI).toString()
    });
  });
});
