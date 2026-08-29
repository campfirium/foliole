import { describe, expect, it } from 'vitest';

import { rotatePdfNormalizedRect, unrotatePdfNormalizedRect } from './pdfVisualExcerptGeometry';
import { resolvePdfExcerptRenderScale } from './pdfVisualExcerptRenderer';

describe('PDF visual excerpt geometry', () => {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

  it.each([0, 90, 180, 270])('round trips a normalized rectangle at %s degrees', (rotation) => {
    const roundTrip = unrotatePdfNormalizedRect(rotatePdfNormalizedRect(rect, rotation), rotation);
    expect(roundTrip.x).toBeCloseTo(rect.x, 8);
    expect(roundTrip.y).toBeCloseTo(rect.y, 8);
    expect(roundTrip.width).toBeCloseTo(rect.width, 8);
    expect(roundTrip.height).toBeCloseTo(rect.height, 8);
  });

  it('keeps output inside the dimension and pixel budgets', () => {
    const scale = resolvePdfExcerptRenderScale(5000, 7000, { x: 0, y: 0, width: 1, height: 1 });
    expect(7000 * scale).toBeLessThanOrEqual(4096);
    expect(5000 * 7000 * scale * scale).toBeLessThanOrEqual(8_000_001);
  });
});
