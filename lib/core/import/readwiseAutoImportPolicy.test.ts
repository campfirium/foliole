import { describe, expect, it } from 'vitest';

import {
  createDefaultReadwiseAutoImportPolicy,
  READWISE_AUTO_IMPORT_CATEGORIES,
  migrateLegacyReadwiseAutoImportPolicy,
  normalizeReadwiseAutoImportPolicy,
  resolveReadwiseAutoImportDestination,
  type ReadwiseAutoImportPolicy,
  type ReadwiseImportDestination
} from './readwiseAutoImportPolicy.js';

const destinations: ReadwiseImportDestination[] = ['inbox', 'external', 'off'];

describe('Readwise automatic import policy', () => {
  it('defaults all highlighted categories and only plain PDF and EPUB to Inbox', () => {
    expect(createDefaultReadwiseAutoImportPolicy()).toEqual({
      articleWithHighlights: 'inbox',
      articleWithoutHighlights: 'off',
      emailWithHighlights: 'inbox',
      emailWithoutHighlights: 'off',
      epubWithHighlights: 'inbox',
      epubWithoutHighlights: 'inbox',
      pdfWithHighlights: 'inbox',
      pdfWithoutHighlights: 'inbox',
      rssWithHighlights: 'inbox',
      rssWithoutHighlights: 'off',
      tweetWithHighlights: 'inbox',
      tweetWithoutHighlights: 'off',
      version: 2,
      videoWithHighlights: 'inbox',
      videoWithoutHighlights: 'off'
    });
  });

  it('resolves every category and annotation side independently', () => {
    let checked = 0;
    for (const category of READWISE_AUTO_IMPORT_CATEGORIES) {
      for (const hasHighlights of [true, false]) {
        for (const destination of destinations) {
          const suffix = hasHighlights ? 'WithHighlights' : 'WithoutHighlights';
          const policy = {
            ...createDefaultReadwiseAutoImportPolicy(),
            [`${category}${suffix}`]: destination
          } as ReadwiseAutoImportPolicy;
          expect(resolveReadwiseAutoImportDestination(policy, category, hasHighlights))
            .toBe(destination);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(42);
  });
});

describe('Readwise automatic import policy migration', () => {
  it('migrates the legacy article policy while applying seven-category defaults', () => {
    expect(migrateLegacyReadwiseAutoImportPolicy({
      withHighlightsDestination: 'external',
      withoutHighlightsDestination: 'inbox'
    })).toMatchObject({
      articleWithHighlights: 'external',
      articleWithoutHighlights: 'inbox',
      epubWithHighlights: 'inbox',
      epubWithoutHighlights: 'inbox',
      version: 2
    });
  });

  it('migrates the four-cell policy by preserving article and EPUB choices', () => {
    expect(normalizeReadwiseAutoImportPolicy({
      articleWithHighlights: 'external', articleWithoutHighlights: 'inbox',
      bookWithHighlights: 'off', bookWithoutHighlights: 'external', version: 1
    })).toMatchObject({
      articleWithHighlights: 'external', articleWithoutHighlights: 'inbox',
      emailWithHighlights: 'inbox', emailWithoutHighlights: 'off',
      epubWithHighlights: 'off', epubWithoutHighlights: 'external', version: 2
    });
  });

  it('fails closed on a future policy version', () => {
    expect(() => normalizeReadwiseAutoImportPolicy({ version: 3 }))
      .toThrow('readwise_auto_import_policy_version_unsupported');
  });
});
