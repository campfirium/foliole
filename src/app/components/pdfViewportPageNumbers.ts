import type { PdfSearchVisualHighlight } from './PdfDocumentSearch';

const PDF_PAGE_MIN = 1;
const PDF_INITIAL_RENDER_RADIUS = 1;

interface ResolvePageNumberArgs {
  highlightLocators: Array<{ id: string; page: number; x: number | null; y: number | null }>;
  page: number;
  pdfSelectionLocator: { page: number; rects?: Array<{ height: number; width: number; x: number; y: number }>; x: number; y: number } | undefined;
  searchHighlights: PdfSearchVisualHighlight[];
  searchQuery: string;
  totalPages: number;
}

function addRenderablePage(pageNumbers: Set<number>, pageNumber: number | undefined, totalPages: number) {
  if (!pageNumber || pageNumber < PDF_PAGE_MIN || pageNumber > totalPages) return;
  pageNumbers.add(pageNumber);
}

export function resolveInitialReadyPageNumbers(args: ResolvePageNumberArgs) {
  if (args.searchQuery.trim()) return [args.page];
  const pageNumbers = new Set<number>([args.page]);
  addRenderablePage(pageNumbers, args.pdfSelectionLocator?.page, args.totalPages);
  args.highlightLocators.forEach((locator) => addRenderablePage(pageNumbers, locator.page, args.totalPages));
  return Array.from(pageNumbers);
}

export function resolveRenderablePageNumbers(args: ResolvePageNumberArgs) {
  if (args.searchQuery.trim()) {
    return Array.from({ length: args.totalPages }, (_, index) => index + PDF_PAGE_MIN);
  }
  const firstPage = Math.max(PDF_PAGE_MIN, args.page - PDF_INITIAL_RENDER_RADIUS);
  const lastPage = Math.min(args.totalPages, args.page + PDF_INITIAL_RENDER_RADIUS);
  const pageNumbers = new Set<number>();
  for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) pageNumbers.add(pageNumber);
  addRenderablePage(pageNumbers, args.pdfSelectionLocator?.page, args.totalPages);
  args.highlightLocators.forEach((locator) => addRenderablePage(pageNumbers, locator.page, args.totalPages));
  args.searchHighlights.forEach((highlight) => {
    addRenderablePage(pageNumbers, highlight.page, args.totalPages);
    highlight.fragments?.forEach((fragment) => addRenderablePage(pageNumbers, fragment.page, args.totalPages));
  });
  return Array.from(pageNumbers).sort((left, right) => left - right);
}
