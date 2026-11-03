import { PDF_READER_PLACEHOLDER_TEXT } from '../nodes/nodeOpeningPreview.js';

export function buildPdfReaderPlaceholder(sourceName: string) {
  const filename = sourceName.replace(/\\/gu, '/').split('/').pop() ?? sourceName;
  const dot = filename.lastIndexOf('.');
  const title = dot > 0 ? filename.slice(0, dot) : filename;
  return [`# ${title}`, '', PDF_READER_PLACEHOLDER_TEXT].join('\n');
}
