import { expect, it } from 'vitest';

it('loads the PDF text layer from a fresh renderer without prior PDF.js initialization', async () => {
  const { PdfOfficialTextLayer } = await import('./PdfOfficialTextLayer');
  expect(PdfOfficialTextLayer).toBeTypeOf('function');
});
