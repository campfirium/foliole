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
      {
        excerpt: 'Before important after',
        highlightText: 'important',
        matched: true,
        sourceName: 'Imported article'
      },
      { highlightText: 'missing quote', matched: false, sourceName: 'Imported article' }
    ]);
  });

  it('previews inline imported highlights from their matched body location', () => {
    const result = buildImportedHighlightPreviewFromMatches({
      content: 'Metadata that should not be used as the highlight preview.\n\nActual body has useful highlighted words here.',
      matchedHighlights: [{ content: 'useful highlighted words', label: null }],
      sourceName: 'Imported article'
    });

    expect(result.samples[0]).toMatchObject({
      excerpt: expect.stringContaining('Actual body has useful highlighted words here'),
      highlightText: 'useful highlighted words',
      matched: true
    });
    expect(result.samples[0]?.excerpt).not.toContain('Metadata that should not be used');
  });

  it('removes highlight notes from preview matching text', () => {
    const result = buildImportedHighlightPreviewFromMatches({
      content: 'Before important after',
      matchedHighlights: [{ content: 'important\n※ Reader note', label: null, locatorText: 'Before important after' }],
      sourceName: 'Imported article'
    });

    expect(result.samples[0]).toMatchObject({
      excerpt: 'Before important after',
      highlightText: 'important',
      matched: true
    });
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
