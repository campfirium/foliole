import { expect, it } from 'vitest';

import { buildFtsSearchQueryPlan, matchesFtsSearchText } from '../../lib/core/database/ftsSearchQuery.js';

it('builds a quoted literal query and escapes embedded double quotes', () => {
  const plan = buildFtsSearchQueryPlan('Alpha "Bravo" c"d');

  expect(plan.literalQuery).toBe('"alpha bravo c""d"');
  expect(plan.termQuery).toBe('"alpha" AND "bravo" AND "c""d"');
  expect(plan.advancedQuery).toBeNull();
});

it('keeps punctuation out of the ordinary literal query', () => {
  const plan = buildFtsSearchQueryPlan('Question?');

  expect(plan.literalQuery).toBe('"question"');
  expect(plan.advancedQuery).toBeNull();
  expect(matchesFtsSearchText('This question has a plain marker.', plan)).toBe(true);
});

it('matches ordinary text when punctuation separates query terms in the document', () => {
  const plan = buildFtsSearchQueryPlan('Lists Twitter List January');

  expect(matchesFtsSearchText('Lists Twitter List: January 17', plan)).toBe(true);
  expect(plan.termQuery).toBe('"lists" AND "twitter" AND "list" AND "january"');
});

it('adds an advanced query only for standalone uppercase boolean operators', () => {
  expect(buildFtsSearchQueryPlan('Atlas AND Launch')).toMatchObject({
    advancedQuery: '"atlas" AND "launch"',
    highlightQuery: 'atlas',
    literalQuery: '"atlas and launch"'
  });
  expect(buildFtsSearchQueryPlan('Atlas and Launch')).toMatchObject({
    advancedQuery: null,
    highlightQuery: 'atlas and launch',
    literalQuery: '"atlas and launch"'
  });
});

it('drops illegal advanced operator sequences back to the literal query', () => {
  expect(buildFtsSearchQueryPlan('NOT Atlas').advancedQuery).toBeNull();
  expect(buildFtsSearchQueryPlan('Atlas AND AND Launch').advancedQuery).toBeNull();
  expect(buildFtsSearchQueryPlan('Atlas AND').advancedQuery).toBeNull();
});

it('evaluates advanced text matches for non-FTS external document rows', () => {
  const plan = buildFtsSearchQueryPlan('Atlas AND Launch');

  expect(matchesFtsSearchText('Atlas roadmap contains Launch notes.', plan)).toBe(true);
  expect(matchesFtsSearchText('Atlas roadmap only.', plan)).toBe(false);
});
