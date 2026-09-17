// @vitest-environment node

import { expect, it } from 'vitest';

import { isReadwiseApiCandidateBlockedByCutover } from './readwiseApiCandidateSkip.js';
import type { ReadwiseApiCandidate } from './readwiseApiCandidateTypes.js';

const candidate = {
  destination: 'inbox', documentId: 'document', exportCategory: null,
  hasHighlights: false, highlightIds: [], readerCategory: 'rss',
  status: 'pending', title: 'Document'
} satisfies ReadwiseApiCandidate;

it('lets a current tag match override only migration suppression', () => {
  expect(isReadwiseApiCandidateBlockedByCutover(candidate, 'suppressed')).toBe(true);
  expect(isReadwiseApiCandidateBlockedByCutover(
    { ...candidate, matchedImportTag: true }, 'suppressed'
  )).toBe(false);
  expect(isReadwiseApiCandidateBlockedByCutover(
    { ...candidate, matchedImportTag: true }, 'blocked'
  )).toBe(true);
});
