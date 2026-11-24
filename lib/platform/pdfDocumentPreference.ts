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
export const pdfReadingViewSchema = z
  .object({
    mode: z.enum(['auto', 'manual', 'free']),
    automatic: pdfViewRectSchema.nullable(),
    automaticVersion: z.number().int().nonnegative().optional(),
    manual: pdfViewRectSchema.nullable()
  })
  .refine((view) => view.mode !== 'manual' || view.manual !== null);
export type PdfReadingView = z.infer<typeof pdfReadingViewSchema>;

export const pdfTopBarsRecordsSchema = z.record(z.string(), z.boolean());
export const pdfReadingViewsSchema = z.record(z.string(), pdfReadingViewSchema);

export const pdfDocumentPreferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('topBars'), fingerprint: z.string().min(1), enabled: z.boolean() }),
  z.object({ kind: z.literal('readingView'), fingerprint: z.string().min(1), view: pdfReadingViewSchema })
]);
export type PdfDocumentPreference = z.infer<typeof pdfDocumentPreferenceSchema>;
