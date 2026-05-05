import { describe, expect, it } from 'vitest';

import { buildImportedHighlightPreview } from '../../lib/core/import/importedHighlightPreview';

describe('importedHighlightPreview', () => {
  it('detects imported highlight and cloze tags from imported content', () => {
    const result = buildImportedHighlightPreview({
      content: 'Before <highlight id="h1">important</highlight id="h1"> and <cloze id="c1">hidden</cloze id="c1"> after',
      sourceName: 'Imported article'
    });

    expect(result.detectedHighlightCount).toBe(2);
    expect(result.samples).toMatchObject([
      { highlightText: 'important', matched: true, sourceName: 'Imported article' },
      { highlightText: 'hidden', matched: true, sourceName: 'Imported article' }
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
