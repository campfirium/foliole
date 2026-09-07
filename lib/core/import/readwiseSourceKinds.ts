export type ReadwiseSourceKind = 'books' | 'articles' | 'tweets' | 'podcasts';

export const READWISE_FOLDER_NAMES: Record<ReadwiseSourceKind, string> = {
  articles: 'Articles',
  books: 'Books',
  podcasts: 'Podcasts',
  tweets: 'Tweets'
};

export function formatReadwiseSourceLabel(kind: ReadwiseSourceKind) {
  return READWISE_FOLDER_NAMES[kind];
}
