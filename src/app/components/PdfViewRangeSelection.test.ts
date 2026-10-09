import { expect, it } from 'vitest';

import { resolveViewRangeDrag } from './PdfViewRangeSelection';

const rect = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 };
it('draws in either direction and clamps movement to the full page', () => {
  expect(resolveViewRangeDrag({ kind: 'draw', x: 0.8, y: 0.9, rect }, 0.2, 0.3)).toMatchObject({
    x: 0.2,
    y: 0.3
  });
  expect(resolveViewRangeDrag({ kind: 'move', x: 0.1, y: 0.2, rect }, 1, 1)).toEqual({
    ...rect,
    x: 0.4,
    y: 0.5
  });
});
it('resizes a corner while retaining its opposite corner', () => {
  const result = resolveViewRangeDrag({ kind: 'nw', x: 0.1, y: 0.2, rect }, 0.2, 0.3);
  expect(result.x + result.width).toBeCloseTo(0.7);
  expect(result.y + result.height).toBeCloseTo(0.7);
});
