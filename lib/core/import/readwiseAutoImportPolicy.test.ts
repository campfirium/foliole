import { describe, expect, it } from 'vitest';

import {
  createDefaultReadwiseAutoImportPolicy,
  enabledReadwiseReaderCategories,
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
      importTag: '',
      pdfWithHighlights: 'inbox',
      pdfWithoutHighlights: 'inbox',
      rssWithHighlights: 'inbox',
      rssWithoutHighlights: 'off',
      tweetWithHighlights: 'inbox',
      tweetWithoutHighlights: 'off',
      version: 3,
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

  it('scans highlighted destinations when one import tag is configured', () => {
    const defaults = createDefaultReadwiseAutoImportPolicy();
    expect(enabledReadwiseReaderCategories(defaults)).toEqual(['pdf', 'epub']);
    expect(enabledReadwiseReaderCategories({ ...defaults, importTag: 'favorite' }))
      .toEqual(READWISE_AUTO_IMPORT_CATEGORIES);
    expect(enabledReadwiseReaderCategories({
      ...defaults,
      articleWithHighlights: 'off',
      importTag: 'favorite'
    })).not.toContain('article');
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
      importTag: '',
      version: 3
    });
  });

  it('migrates the four-cell policy by preserving article and EPUB choices', () => {
    expect(normalizeReadwiseAutoImportPolicy({
      articleWithHighlights: 'external', articleWithoutHighlights: 'inbox',
      bookWithHighlights: 'off', bookWithoutHighlights: 'external', version: 1
    })).toMatchObject({
      articleWithHighlights: 'external', articleWithoutHighlights: 'inbox',
      emailWithHighlights: 'inbox', emailWithoutHighlights: 'off',
      epubWithHighlights: 'off', epubWithoutHighlights: 'external', importTag: '', version: 3
    });
  });

  it('trims one optional tag and routes tag-only documents through the highlighted cell', () => {
    const policy = normalizeReadwiseAutoImportPolicy({
      ...createDefaultReadwiseAutoImportPolicy(),
      articleWithHighlights: 'external',
      articleWithoutHighlights: 'off',
      importTag: '  favorite  '
    });

    expect(policy.importTag).toBe('favorite');
    expect(resolveReadwiseAutoImportDestination(policy, 'article', false, true)).toBe('external');
    expect(resolveReadwiseAutoImportDestination(policy, 'article', false, false)).toBe('off');
  });

  it('fails closed on a future policy version', () => {
    expect(() => normalizeReadwiseAutoImportPolicy({ version: 4 }))
      .toThrow('readwise_auto_import_policy_version_unsupported');
  });
});
