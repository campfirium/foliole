import { describe, expect, it } from 'vitest';

import {
  collectMarkdownLinkReferenceRanges,
  collectMarkdownLinkReferences,
  normalizeMarkdownLinkReferenceLabel
} from './markdownLinkReferences';

describe('markdownLinkReferences', () => {
  it('collects parser-backed link reference definitions', () => {
    expect(Array.from(collectMarkdownLinkReferences('[Ref]: <https://example.com>\n[ref]: https://later.test'))).toEqual([
      ['ref', 'https://example.com']
    ]);
  });

  it('normalizes labels case-insensitively with collapsed whitespace', () => {
    expect(normalizeMarkdownLinkReferenceLabel('[ A   Ref ]')).toBe('a ref');
  });

  it('collects link reference definition ranges for preview hiding', () => {
    expect(collectMarkdownLinkReferenceRanges('Text\n\n[ref]: https://example.com')).toEqual([
      { from: 6, lineFrom: 6, to: 32 }
    ]);
  });
});
