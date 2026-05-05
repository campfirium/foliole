import { describe, expect, it } from 'vitest';

import articleFullFixture from './fixtures/readwise-reader-v1-article-full.json';
import articleHighlightsFixture from './fixtures/readwise-reader-v1-article-highlights.json';
import bookHighlightsFixture from './fixtures/readwise-reader-v1-book-highlights.json';
import {
  parseReadwiseReaderV1Document,
  READWISE_READER_V1_SUPPORTED_INPUT_SHAPES
} from './readwiseReaderV1Parser';

const fixtureCases = [
  {
    expected: {
      author: 'Shawn Example',
      content: 'Writing down what you learn creates a durable trail for later retrieval.',
      contentHtml:
        '<article><p>Writing down what you learn creates a durable trail for later retrieval.</p></article>',
      highlights: [],
      id: 'rdoc_article_full_001',
      inputShape: 'article_full',
      siteName: 'Example Essays',
      sourceKind: 'article',
      sourceUrl: 'https://example.com/learning-in-public',
      title: 'Learning in Public',
      updatedAt: '2026-03-01T09:10:11.000Z'
    },
    fixture: articleFullFixture,
    name: 'article full'
  },
  {
    expected: {
      author: 'Dana Example',
      content: null,
      contentHtml: null,
      highlights: [
        {
          highlightedAt: '2026-03-02T10:11:12.000Z',
          id: 'rh_article_001',
          location: 128,
          locationType: 'offset',
          note: 'Good import target',
          text: 'A note becomes valuable when it can be found again in a future context.'
        }
      ],
      id: 'rdoc_article_highlights_001',
      inputShape: 'article_highlights',
      siteName: 'Research Weekly',
      sourceKind: 'article',
      sourceUrl: 'https://example.com/value-of-notes',
      title: 'The Long-Term Value of Notes',
      updatedAt: '2026-03-02T10:12:13.000Z'
    },
    fixture: articleHighlightsFixture,
    name: 'article highlight'
  },
  {
    expected: {
      author: 'Peter C. Brown',
      content: null,
      contentHtml: null,
      highlights: [
        {
          highlightedAt: '2026-03-03T11:12:13.000Z',
          id: 'rh_book_001',
          location: 42,
          locationType: 'page',
          note: null,
          text: 'Learning is deeper and more durable when it is effortful.'
        }
      ],
      id: 'rdoc_book_highlights_001',
      inputShape: 'book_highlights',
      siteName: null,
      sourceKind: 'book',
      sourceUrl: 'https://read.readwise.io/book/make-it-stick',
      title: 'Make It Stick',
      updatedAt: '2026-03-03T11:13:14.000Z'
    },
    fixture: bookHighlightsFixture,
    name: 'book highlight'
  }
] as const;

describe('readwiseReaderV1Parser', () => {
  it('freezes the supported reader v1 input shapes', () => {
    expect(READWISE_READER_V1_SUPPORTED_INPUT_SHAPES).toEqual([
      'article_full',
      'article_highlights',
      'book_highlights'
    ]);
  });

  it.each(fixtureCases)('parses the real-sample %s fixture', ({ expected, fixture, name }) => {
    expect(name).toBeTruthy();
    expect(parseReadwiseReaderV1Document(fixture)).toStrictEqual(expected);
  });
});
