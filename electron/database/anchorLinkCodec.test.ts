import { describe, expect, it } from 'vitest';

import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';

describe('parseStoredAnchorLink', () => {
  it('keeps locator rects when payload contains normalized highlight areas', () => {
    const value = JSON.stringify({
      id: 'pdf-1',
      kind: 'highlight',
      locator: {
        page: 2,
        rects: [{ x: 0.25, y: 0.3, width: 0.4, height: 0.08 }],
        x: 0.4,
        y: 0.34
      }
    });

    expect(parseStoredAnchorLink(value)).toEqual({
      id: 'pdf-1',
      kind: 'highlight',
      locator: {
        page: 2,
        rects: [{ x: 0.25, y: 0.3, width: 0.4, height: 0.08 }],
        x: 0.4,
        y: 0.34
      }
    });
  });
});
