export const FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY = 'fullTextSearch.indexStrategy';

export const FULL_TEXT_SEARCH_INDEX_STRATEGY_VALUES = ['word-based', 'cjk-trigram'] as const;

export type FullTextSearchIndexStrategy = (typeof FULL_TEXT_SEARCH_INDEX_STRATEGY_VALUES)[number];
export type FullTextSearchTokenizer = 'trigram' | 'unicode61';

export interface FullTextSearchIndexStrategyResolution {
  strategy: FullTextSearchIndexStrategy;
  tokenizer: FullTextSearchTokenizer;
}

export const DEFAULT_FULL_TEXT_SEARCH_INDEX_STRATEGY: FullTextSearchIndexStrategy = 'word-based';

export const FULL_TEXT_SEARCH_INDEX_STRATEGY_OPTIONS: Array<{
  description: string;
  label: string;
  value: FullTextSearchIndexStrategy;
}> = [
  {
    description: 'Best for English and other languages separated by spaces.',
    label: 'Word-based',
    value: 'word-based'
  },
  {
    description: 'Best for Chinese, Japanese, Korean, and mixed text without spaces.',
    label: 'CJK trigram',
    value: 'cjk-trigram'
  }
];

export function normalizeFullTextSearchIndexStrategy(value: unknown): FullTextSearchIndexStrategy {
  return FULL_TEXT_SEARCH_INDEX_STRATEGY_VALUES.includes(value as FullTextSearchIndexStrategy)
    ? value as FullTextSearchIndexStrategy
    : DEFAULT_FULL_TEXT_SEARCH_INDEX_STRATEGY;
}

export function resolveFullTextSearchIndexStrategy(
  appSettings: Record<string, unknown> | null | undefined
): FullTextSearchIndexStrategyResolution {
  const strategy = normalizeFullTextSearchIndexStrategy(
    appSettings?.[FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]
  );
  return {
    strategy,
    tokenizer: strategy === 'cjk-trigram' ? 'trigram' : 'unicode61'
  };
}
