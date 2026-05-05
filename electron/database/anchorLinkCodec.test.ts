import { describe, expect, it } from 'vitest';

import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';

describe('parseStoredAnchorLink', () => {
  it('keeps text locators when payload contains editor range anchors', () => {
    const value = JSON.stringify({
      id: 'text-1',
      kind: 'highlight',
      locator: {
        from: 7,
        to: 12,
        originalText: 'Alpha'
      }
    });

    expect(parseStoredAnchorLink(value)).toEqual({
      id: 'text-1',
      kind: 'highlight',
      locator: {
        from: 7,
        to: 12,
        originalText: 'Alpha'
      }
    });
  });

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

  it('drops malformed text locators instead of trusting partial payloads', () => {
    const value = JSON.stringify({
      id: 'text-2',
      kind: 'cloze',
      locator: {
        from: 9,
        originalText: 'Beta'
      }
    });

    expect(parseStoredAnchorLink(value)).toEqual({
      id: 'text-2',
      kind: 'cloze'
    });
  });

  it('keeps grouped text locators when payload contains multi-range cloze anchors', () => {
    const value = JSON.stringify({
      id: 'text-multi-1',
      kind: 'cloze',
      locator: {
        ranges: [
          {
            from: 0,
            to: 5,
            originalText: 'Alpha'
          },
          {
            from: 11,
            to: 16,
            originalText: 'Gamma'
          }
        ]
      }
    });

    expect(parseStoredAnchorLink(value)).toEqual({
      id: 'text-multi-1',
      kind: 'cloze',
      locator: {
        ranges: [
          {
            from: 0,
            to: 5,
            originalText: 'Alpha'
          },
          {
            from: 11,
            to: 16,
            originalText: 'Gamma'
          }
        ]
      }
    });
  });
});
