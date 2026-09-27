import { expect, it } from 'vitest';

import { findSearchAliasSpan, findSearchAliasSpans } from './searchAliasEvidence.js';

it('maps accent and width folding back to the original UTF-16 text range', () => {
  const text = 'A café and ＡＩ overview.';
  expect(findSearchAliasSpan(text, 'cafe')).toMatchObject({ from: 2, query: 'café', to: 6 });
  const ai = findSearchAliasSpan(text, 'AI')!;
  expect(text.slice(ai.from, ai.to)).toBe('ＡＩ');
});

it('attributes a longer spelling separately from a contained shorter spelling', () => {
  expect(findSearchAliasSpans('Barack Obama spoke.', ['obama', 'barack obama']).map((span) => span.spelling))
    .toEqual(['barack obama']);
  expect(findSearchAliasSpans('Barack Obama spoke. Obama answered.', ['obama', 'barack obama'])
    .map((span) => span.spelling)).toEqual(['obama', 'barack obama']);
  expect(findSearchAliasSpan('Obamacare', 'Obama')).toBeNull();
});
