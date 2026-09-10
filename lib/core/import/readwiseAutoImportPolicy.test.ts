import { describe, expect, it } from 'vitest';

import {
  createDefaultReadwiseAutoImportPolicy,
  migrateLegacyReadwiseAutoImportPolicy,
  normalizeReadwiseAutoImportPolicy,
  resolveReadwiseAutoImportDestination,
  type ReadwiseAutoImportPolicy,
  type ReadwiseImportDestination
} from './readwiseAutoImportPolicy.js';

const destinations: ReadwiseImportDestination[] = ['inbox', 'external', 'off'];

describe('Readwise automatic import policy', () => {
  it('defaults articles without highlights off and all other cells to Inbox', () => {
    expect(createDefaultReadwiseAutoImportPolicy()).toEqual({
      articleWithHighlights: 'inbox',
      articleWithoutHighlights: 'off',
      bookWithHighlights: 'inbox',
      bookWithoutHighlights: 'inbox',
      version: 1
    });
  });

  it('resolves all 81 independently configurable policy combinations', () => {
    let checked = 0;
    for (const articleWithHighlights of destinations) {
      for (const articleWithoutHighlights of destinations) {
        for (const bookWithHighlights of destinations) {
          for (const bookWithoutHighlights of destinations) {
            const policy: ReadwiseAutoImportPolicy = {
              articleWithHighlights,
              articleWithoutHighlights,
              bookWithHighlights,
              bookWithoutHighlights,
              version: 1
            };
            expect(resolveReadwiseAutoImportDestination(policy, 'article', true))
              .toBe(articleWithHighlights);
            expect(resolveReadwiseAutoImportDestination(policy, 'article', false))
              .toBe(articleWithoutHighlights);
            expect(resolveReadwiseAutoImportDestination(policy, 'book', true))
              .toBe(bookWithHighlights);
            expect(resolveReadwiseAutoImportDestination(policy, 'book', false))
              .toBe(bookWithoutHighlights);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(81);
  });

  it('migrates the legacy article policy while defaulting both book cells to Inbox', () => {
    expect(migrateLegacyReadwiseAutoImportPolicy({
      withHighlightsDestination: 'external',
      withoutHighlightsDestination: 'inbox'
    })).toEqual({
      articleWithHighlights: 'external',
      articleWithoutHighlights: 'inbox',
      bookWithHighlights: 'inbox',
      bookWithoutHighlights: 'inbox',
      version: 1
    });
  });

  it('fails closed on a future policy version', () => {
    expect(() => normalizeReadwiseAutoImportPolicy({ version: 2 }))
      .toThrow('readwise_auto_import_policy_version_unsupported');
  });
});
