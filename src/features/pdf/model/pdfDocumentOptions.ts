import type { DocumentProps } from 'react-pdf';

const PDFJS_RESOURCE_PUBLIC_PATH = 'pdfjs-resources';

function resourceUrl(group: string) {
  const baseUrl = globalThis.document?.baseURI ?? globalThis.location?.href ?? 'http://127.0.0.1/';
  return new URL(`./${PDFJS_RESOURCE_PUBLIC_PATH}/${group}/`, baseUrl).toString();
}

export const PDF_DOCUMENT_OPTIONS: NonNullable<DocumentProps['options']> = Object.freeze({
  cMapPacked: true,
  cMapUrl: resourceUrl('cmaps'),
  iccUrl: resourceUrl('iccs'),
  standardFontDataUrl: resourceUrl('standard_fonts'),
  wasmUrl: resourceUrl('wasm')
});
