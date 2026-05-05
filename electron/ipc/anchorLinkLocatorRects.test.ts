import { describe, expect, it } from 'vitest';

import { parseAnchorLinkLocatorRects } from './anchorLinkLocatorRects.js';

describe('parseAnchorLinkLocatorRects', () => {
  it('normalizes rect ranges and preserves valid coordinates', () => {
    expect(parseAnchorLinkLocatorRects([{ x: 1.4, y: -0.2, width: 0.5, height: 2 }], 'anchor.rects')).toEqual([
      { x: 1, y: 0, width: 0.5, height: 1 }
    ]);
  });

  it('throws when rect dimensions are missing or invalid', () => {
    expect(() => parseAnchorLinkLocatorRects([{ x: 0.1, y: 0.2, width: 0, height: 0.1 }], 'anchor.rects')).toThrow(
      'invalid argument: anchor.rects[0].width'
    );
  });
});
