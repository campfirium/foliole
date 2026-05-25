import { expect, it } from 'vitest';

import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  normalizeFullTextSearchIndexStrategy,
  resolveFullTextSearchIndexStrategy
} from './fullTextSearchIndexStrategy.js';

it('normalizes missing or invalid full-text search strategies to word-based', () => {
  expect(normalizeFullTextSearchIndexStrategy(undefined)).toBe('word-based');
  expect(normalizeFullTextSearchIndexStrategy('unknown')).toBe('word-based');
});

it('resolves word-based search strategy to the word tokenizer', () => {
  expect(resolveFullTextSearchIndexStrategy({
    [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'word-based'
  })).toEqual({
    strategy: 'word-based',
    tokenizer: 'unicode61'
  });
});

it('resolves CJK search strategy to trigram', () => {
  expect(resolveFullTextSearchIndexStrategy({
    [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram'
  })).toEqual({
    strategy: 'cjk-trigram',
    tokenizer: 'trigram'
  });
});
