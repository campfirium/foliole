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
    const text = '# Title\nSetext\n---\n> Quote\n- Item\n- [x] Done\n1. Ordered\n#tag/sample';

    expect(collectMarkdownLineClassRanges(text).map(({ className, from }) => ({ className, from }))).toEqual([
      { className: 'cm-line-h1', from: 0 },
      { className: 'cm-line-h2', from: 8 },
      { className: 'cm-line-quote', from: 19 },
      { className: 'cm-line-list-unordered', from: 27 },
      { className: 'cm-line-list-unordered cm-line-task-list', from: 34 },
      { className: 'cm-line-list', from: 45 }
    ]);
  });

  it('collects parser-backed prefix ranges for common markdown blocks', () => {
    const text = '# Title\nSetext\n---\n> Quote\n- Item\n- [x] Done\n1. Ordered';

    expect(collectMarkdownPrefixRanges(text).map(({ checked, from, kind, lineFrom, markerText, to }) => ({
      checked,
      from,
      kind,
      lineFrom,
      markerText,
      to
    }))).toEqual([
      { checked: undefined, from: 0, kind: 'heading', lineFrom: 0, markerText: '', to: 2 },
      { checked: undefined, from: 15, kind: 'heading', lineFrom: 15, markerText: '', to: 18 },
      { checked: undefined, from: 19, kind: 'quote', lineFrom: 19, markerText: '', to: 21 },
      { checked: undefined, from: 27, kind: 'unordered-list', lineFrom: 27, markerText: '• ', to: 29 },
      { checked: true, from: 34, kind: 'task-list', lineFrom: 34, markerText: '', to: 40 },
      { checked: undefined, from: 45, kind: 'ordered-list', lineFrom: 45, markerText: '1. ', to: 48 }
    ]);
  });

  it('collects line classes and hidden syntax ranges for strong-wrapped ATX compatibility headings', () => {
    const text = '**# Article Title**\n**## Deep dive**';

    expect(collectMarkdownLineClassRanges(text).map(({ className, from }) => ({ className, from }))).toEqual([
      { className: 'cm-line-h1', from: 0 },
      { className: 'cm-line-h2', from: 20 }
    ]);
    expect(collectMarkdownPrefixRanges(text).map(({ hiddenRanges, kind, lineFrom }) => ({ hiddenRanges, kind, lineFrom }))).toEqual([
      { hiddenRanges: [{ from: 0, to: 4 }, { from: 17, to: 19 }], kind: 'heading', lineFrom: 0 },
      { hiddenRanges: [{ from: 20, to: 25 }, { from: 34, to: 36 }], kind: 'heading', lineFrom: 20 }
    ]);
  });
});
