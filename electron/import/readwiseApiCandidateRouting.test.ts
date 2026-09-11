import { describe, expect, it } from 'vitest';

import {
  createDefaultReadwiseAutoImportPolicy,
  READWISE_AUTO_IMPORT_CATEGORIES,
  resolveReadwiseAutoImportDestination
} from '../../lib/core/import/readwiseAutoImportPolicy.js';

import { matchesReadwiseDocumentImportTag } from './readwiseApiCandidateRouting.js';

describe('Readwise document import tag routing', () => {
  it('matches document tag names and never treats an empty policy value as a match', () => {
    const tags = { tagId: { name: 'Favorite' } };
    expect(matchesReadwiseDocumentImportTag(tags, ' favorite ')).toBe(true);
    expect(matchesReadwiseDocumentImportTag(tags, '')).toBe(false);
    expect(matchesReadwiseDocumentImportTag(null, 'favorite')).toBe(false);
  });

  it('uses each category highlighted destination without changing highlight truth', () => {
    for (const [index, category] of READWISE_AUTO_IMPORT_CATEGORIES.entries()) {
      const destination = (['inbox', 'external', 'off'] as const)[index % 3]!;
      const policy = {
        ...createDefaultReadwiseAutoImportPolicy(),
        [`${category}WithHighlights`]: destination
      };

      expect(resolveReadwiseAutoImportDestination(policy, category, false, true)).toBe(destination);
    }
  });
});
