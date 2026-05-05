import type { PdfSearchRequest, PdfSearchTarget } from './PdfDocumentSearch';

export function isPdfSearchRuntimeActive(args: {
  searchQuery: string;
  searchRequest: PdfSearchRequest | null;
  searchTarget: PdfSearchTarget | null;
}) {
  return args.searchQuery.trim().length > 0 || args.searchRequest !== null || args.searchTarget !== null;
}
