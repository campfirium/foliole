import { describe, expect, it } from 'vitest';

import {
  collectMarkdownLineClassRanges,
  collectMarkdownPrefixRanges,
  collectMarkdownThematicBreakRanges
} from './markdownBlockProjection';

describe('markdownBlockProjection', () => {
  it('collects GFM thematic break ranges from parser nodes', () => {
    const text = 'Before\n\n---\n\nAfter';

    expect(collectMarkdownThematicBreakRanges(text)).toEqual([
      { from: text.indexOf('---'), kind: 'thematicBreak', to: text.indexOf('---') + 3 }
    ]);
  });

  it('does not treat setext heading underline as a thematic break', () => {
    expect(collectMarkdownThematicBreakRanges('Title\n---\nBody')).toEqual([]);
  });

  it('collects parser-backed line classes for common markdown blocks', () => {
    const text = '# Title\n> Quote\n- Item\n- [x] Done\n1. Ordered\n#tag/sample';

    expect(collectMarkdownLineClassRanges(text).map(({ className, from }) => ({ className, from }))).toEqual([
      { className: 'cm-line-h1', from: 0 },
      { className: 'cm-line-quote', from: 8 },
      { className: 'cm-line-list-unordered', from: 16 },
      { className: 'cm-line-list-unordered cm-line-task-list', from: 23 },
      { className: 'cm-line-list', from: 34 }
    ]);
  });

  it('collects parser-backed prefix ranges for common markdown blocks', () => {
    const text = '# Title\n> Quote\n- Item\n- [x] Done\n1. Ordered';

    expect(collectMarkdownPrefixRanges(text).map(({ checked, from, kind, lineFrom, markerText, to }) => ({
      checked,
      from,
      kind,
      lineFrom,
      markerText,
      to
    }))).toEqual([
      { checked: undefined, from: 0, kind: 'heading', lineFrom: 0, markerText: '', to: 2 },
      { checked: undefined, from: 8, kind: 'quote', lineFrom: 8, markerText: '', to: 10 },
      { checked: undefined, from: 16, kind: 'unordered-list', lineFrom: 16, markerText: '• ', to: 18 },
      { checked: true, from: 23, kind: 'task-list', lineFrom: 23, markerText: '', to: 29 },
      { checked: undefined, from: 34, kind: 'ordered-list', lineFrom: 34, markerText: '1. ', to: 37 }
    ]);
  });
});
