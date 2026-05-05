import { describe, expect, it } from 'vitest';

import { applyImportHighlightPolicy } from '../../../lib/core/import/highlightPolicy.js';

describe('applyImportHighlightPolicy', () => {
  it('collects adopted markdown highlights while keeping the body text plain', () => {
    expect(applyImportHighlightPolicy('Use ==important== text', 'adopt')).toEqual({
      content: 'Use important text',
      highlights: [{ content: 'important', label: null }]
    });
  });

  it('leaves markdown markers untouched when policy is reference_only', () => {
    expect(applyImportHighlightPolicy('Use ==important== text', 'reference_only')).toEqual({
      content: 'Use ==important== text',
      highlights: []
    });
  });
});
