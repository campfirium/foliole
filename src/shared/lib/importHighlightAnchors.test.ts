import { describe, expect, it, vi } from 'vitest';

import { applyImportedHighlightAnchors } from '../../../lib/core/database/importHighlightAnchors.js';

describe('applyImportedHighlightAnchors', () => {
  it('wraps matched excerpts with the shared highlight serializer', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('11111111-1111-1111-1111-111111111111');
    const anchorId = 'imported-highlight-11111111-1111-1111-1111-111111111111';

    const anchored = applyImportedHighlightAnchors({
      content: 'Alpha Beta Gamma',
      highlights: [{ content: 'Beta', label: null }]
    });

    expect(anchored).toEqual({
      content: 'Alpha Beta Gamma',
      highlights: [{ anchorId, content: 'Beta', from: 6, kind: 'highlight', label: null, locatorText: 'Beta', to: 10 }]
    });
  });

  it('strips imported highlight and cloze tags into pure markdown while preserving anchored ranges', () => {
    const anchored = applyImportedHighlightAnchors({
      content: 'Alpha <highlight id="h1">Beta</highlight id="h1"> <cloze id="c1">Gamma</cloze id="c1">',
      highlights: undefined
    });

    expect(anchored).toEqual({
      content: 'Alpha Beta Gamma',
      highlights: [
        { anchorId: 'h1', content: 'Beta', from: 6, kind: 'highlight', label: null, locatorText: 'Beta', to: 10 },
        { anchorId: 'c1', content: 'Gamma', from: 11, kind: 'cloze', label: null, locatorText: 'Gamma', to: 16 }
      ]
    });
  });

  it('keeps nested imported anchor ranges aligned to visible text positions', () => {
    const anchored = applyImportedHighlightAnchors({
      content:
        'X<highlight id="h1">12<highlight id="h2">34</highlight id="h1">56</highlight id="h2">Y',
      highlights: undefined
    });

    expect(anchored).toEqual({
      content: 'X123456Y',
      highlights: [
        { anchorId: 'h1', content: '1234', from: 1, kind: 'highlight', label: null, locatorText: '1234', to: 5 },
        { anchorId: 'h2', content: '3456', from: 3, kind: 'highlight', label: null, locatorText: '3456', to: 7 }
      ]
    });
  });
});
