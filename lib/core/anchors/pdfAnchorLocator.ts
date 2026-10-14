import { z } from 'zod';

const ratio = z.number().finite().min(0).max(1);
const rect = z.object({ x: ratio, y: ratio, width: ratio.positive(), height: ratio.positive() }).strict();
const singlePage = z.object({ page: z.number().int().positive(), x: ratio, y: ratio, rects: z.array(rect).optional() });
type ParsedSinglePage = z.infer<typeof singlePage>;
export type PdfAnchorLocator = Omit<ParsedSinglePage, 'rects'> & { rects?: NonNullable<ParsedSinglePage['rects']> };

const page = z.object({ page: z.number().int().positive(), x: ratio, y: ratio, rects: z.array(rect).nonempty() }).strict();
const pages = z.object({ pages: z.array(page).min(2) }).strict().refine(
  value => value.pages.every((fragment, index) => index === 0 || fragment.page > (value.pages[index - 1]?.page ?? 0))
);

export type PdfMultiPageAnchorLocator = z.infer<typeof pages>;
export type PdfSelectionLocator = PdfAnchorLocator | PdfMultiPageAnchorLocator;

export function parsePdfMultiPageAnchorLocator(value: unknown): PdfMultiPageAnchorLocator | null {
  const result = pages.safeParse(value);
  return result.success ? result.data : null;
}

export function getPdfAnchorLocators(locator: unknown): PdfAnchorLocator[] {
  if (!locator || typeof locator !== 'object') return [];
  if ('pages' in locator) return parsePdfMultiPageAnchorLocator(locator)?.pages ?? [];
  const result = singlePage.safeParse(locator);
  if (!result.success) return [];
  const { page, x, y, rects } = result.data;
  return [{ page, x, y, ...(rects ? { rects } : {}) }];
}
