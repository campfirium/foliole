import { describe, expect, it, vi } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import {
  collectMarkdownLinkReferenceRangesFromTree,
  collectMarkdownLinkReferenceRanges,
  collectMarkdownLinkReferencesFromTree,
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

  it('reuses a parsed markdown tree for references and ranges', () => {
    const source = 'Text\n\n[ref]: https://example.com';
    const tree = folioleMarkdownParser.parse(source);
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    parseSpy.mockClear();

    expect(Array.from(collectMarkdownLinkReferencesFromTree(tree, source))).toEqual(
      Array.from(collectMarkdownLinkReferences(source))
    );
    expect(collectMarkdownLinkReferenceRangesFromTree(tree, source)).toEqual(
      collectMarkdownLinkReferenceRanges(source)
    );
    expect(parseSpy).toHaveBeenCalledTimes(2);
    parseSpy.mockRestore();
  });
});
