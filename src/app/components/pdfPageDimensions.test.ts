import { expect, it } from 'vitest';

import { resolvePdfCanvasPixelRatio } from './pdfPageDimensions';

it('keeps the backing canvas within the PDF.js pixel budget at high zoom', () => {
  const page = {
    dimensions: { width: 600, height: 800 },
    fitWidth: null,
    rotation: 0,
    zoomMode: 'custom' as const,
    devicePixelRatio: 2
  };
  expect(resolvePdfCanvasPixelRatio({ ...page, zoom: 270 })).toBe(2);
  const ratio = resolvePdfCanvasPixelRatio({ ...page, zoom: 1500 });
  expect(ratio).toBeLessThan(1);
  expect(9000 * 12000 * ratio ** 2).toBeCloseTo(2 ** 25);
});
