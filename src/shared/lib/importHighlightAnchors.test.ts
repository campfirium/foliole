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

  it('does not infer anchors when no matched highlights are provided', () => {
    const anchored = applyImportedHighlightAnchors({
      content: 'Alpha Beta Gamma',
      highlights: undefined
    });

    expect(anchored).toEqual({
      content: 'Alpha Beta Gamma',
      highlights: []
    });
  });
});
