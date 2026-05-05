import { describe, expect, it } from 'vitest';

import { buildImportedHighlightPreview, buildImportedHighlightPreviewFromMatches } from '../../lib/core/import/importedHighlightPreview';

describe('importedHighlightPreview', () => {
  it('previews structured matched and unmatched sidecar highlights', () => {
    const result = buildImportedHighlightPreviewFromMatches({
      content: 'Before important after',
      matchedHighlights: [{ content: 'important', label: null, locatorText: 'Before important after' }],
      unmatchedHighlights: [{ content: 'missing quote', label: 'Missing', locatorText: null }],
      sourceName: 'Imported article'
    });

    expect(result.detectedHighlightCount).toBe(2);
    expect(result.samples).toMatchObject([
      { highlightText: 'important', matched: true, sourceName: 'Imported article' },
      { highlightText: 'missing quote', matched: false, sourceName: 'Imported article' }
    ]);
  });

  it('returns no preview samples when imported content has no imported tags', () => {
    const result = buildImportedHighlightPreview({
      content: 'Before important after',
      sourceName: 'Imported article'
    });

    expect(result).toEqual({
      detectedHighlightCount: 0,
      samples: []
    });
  });
});
