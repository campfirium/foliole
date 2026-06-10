import { describe, expect, it, vi } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import {
  collectMarkdownCalloutPrefixRanges,
  collectMarkdownCalloutPrefixRangesFromTree
} from './markdownOblikeBlockProjection';

describe('markdownOblikeBlockProjection', () => {
  it('collects callout prefixes only from blockquote markers', () => {
    const text = '> [!note] Title\n[!warning] Plain text';

    expect(collectMarkdownCalloutPrefixRanges(text)).toEqual([
      {
        fold: null,
        from: 2,
        kind: 'note',
        lineFrom: 0,
        markerText: 'Note',
        titleFrom: 10,
        titleTo: 15,
        to: 10
      }
    ]);
  });

  it('collects callout fold state and title bounds from parser nodes', () => {
    const text = '> [!warning]- Folded title\n> Body';

    expect(collectMarkdownCalloutPrefixRanges(text)).toEqual([
      {
        fold: 'collapsed',
        from: 2,
        kind: 'warning',
        lineFrom: 0,
        markerText: 'Warning',
        titleFrom: 14,
        titleTo: 26,
        to: 14
      }
    ]);
  });

  it('collects callout prefixes from a shared tree without reparsing', () => {
    const text = '> [!warning]- Folded title\n> Body';
    const tree = folioleMarkdownParser.parse(text);
    const parseSpy = vi.spyOn(folioleMarkdownParser, 'parse');
    parseSpy.mockClear();

    expect(collectMarkdownCalloutPrefixRangesFromTree(tree, text)).toEqual(
      collectMarkdownCalloutPrefixRanges(text)
    );
    expect(parseSpy).toHaveBeenCalledTimes(1);
    parseSpy.mockRestore();
  });
});
