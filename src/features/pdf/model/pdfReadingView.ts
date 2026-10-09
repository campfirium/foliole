import { z } from 'zod';

export const pdfViewRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1)
  })
  .refine((rect) => rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001);
export type PdfViewRect = z.infer<typeof pdfViewRectSchema>;
export const FULL_PDF_VIEW: PdfViewRect = { x: 0, y: 0, width: 1, height: 1 };
export const PDF_AUTOMATIC_VIEW_VERSION = 1;
export const pdfReadingViewSchema = z
  .object({
    mode: z.enum(['auto', 'manual', 'free']),
    automatic: pdfViewRectSchema.nullable(),
    automaticVersion: z.number().int().nonnegative().optional(),
    manual: pdfViewRectSchema.nullable()
  })
  .refine((view) => view.mode !== 'manual' || view.manual !== null);
export type PdfReadingView = z.infer<typeof pdfReadingViewSchema>;
export const DEFAULT_PDF_READING_VIEW: PdfReadingView = {
  mode: 'auto',
  automatic: null,
  manual: null
};

export function unionPdfViews(rects: PdfViewRect[]): PdfViewRect {
  if (!rects.length) return FULL_PDF_VIEW;
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y
  };
}
