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
      content: `Alpha <highlight id="${anchorId}">Beta</highlight id="${anchorId}"> Gamma`,
      highlights: [{ anchorId, content: 'Beta', label: null }]
    });
  });
});
