import { describe, expect, it } from 'vitest';

import { remapRawStoredAnchorLink, remapStoredTextAnchorLink } from './storedAnchorLinkRemap.js';

describe('stored anchor link remap', () => {
  it('remaps a typed text locator through parent content edits', () => {
    const result = remapStoredTextAnchorLink({
      anchorLink: {
        id: 'anchor-1',
        kind: 'highlight',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      nextContent: 'Start Alpha Beta Gamma',
      previousContent: 'Alpha Beta Gamma'
    });

    expect(result?.anchorLink.locator).toEqual({ from: 12, originalText: 'Beta', to: 16 });
  });

  it('remaps typed text locator groups and keeps multi-range shape', () => {
    const result = remapStoredTextAnchorLink({
      anchorLink: {
        id: 'anchor-1',
        kind: 'highlight',
        locator: {
          ranges: [
            { from: 0, originalText: 'Alpha', to: 5 },
            { from: 11, originalText: 'Gamma', to: 16 }
          ]
        }
      },
      nextContent: 'Start Alpha Beta Gamma',
      previousContent: 'Alpha Beta Gamma'
    });

    expect(result?.anchorLink.locator).toEqual({
      ranges: [
        { from: 6, originalText: 'Alpha', to: 11 },
        { from: 17, originalText: 'Gamma', to: 22 }
      ]
    });
  });

  it('normalizes raw single-range groups to a text locator', () => {
    const result = remapRawStoredAnchorLink({
      nextContent: 'Start Alpha Beta Gamma',
      previousContent: 'Alpha Beta Gamma',
      value: JSON.stringify({
        id: 'anchor-1',
        kind: 'highlight',
        locator: {
          ranges: [
            { from: 6, originalText: 'Beta', to: 10 }
          ]
        }
      })
    });

    expect('value' in result ? JSON.parse(result.value).locator : null).toEqual({
      from: 12,
      originalText: 'Beta',
      to: 16
    });
  });
});
