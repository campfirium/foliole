import { expect, it } from 'vitest';

import { snapPdfViewRange } from './pdfViewRangeSnap';

const rect = { x: .103, y: .203, width: .6, height: .5 };
const guides = { x: [.1, .7], y: [.2, .7] };
const size = { width: 1000, height: 1000 };
it('moves the whole range onto nearby content edges without changing its size', () => {
  const next = snapPdfViewRange(rect, guides, size, 'move');
  expect(next.rect).toEqual({ x: .1, y: .2, width: .6, height: .5 });
});
it('resizes the moving corner while retaining the opposite corner', () => {
  const next = snapPdfViewRange(rect, guides, size, 'nw');
  expect(next.rect.x).toBe(.1);
  expect(next.rect.x + next.rect.width).toBeCloseTo(.703);
  expect(next.rect.y + next.rect.height).toBeCloseTo(.703);
});
