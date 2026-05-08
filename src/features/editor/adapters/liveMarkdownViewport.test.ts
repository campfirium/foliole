import { describe, expect, it } from 'vitest';

import { resolveVisibleLineWindow, shouldRefreshLineDecorations } from './liveMarkdownViewport';

function createMockView(args: {
  text: string;
  viewport: { from: number; to: number };
  visibleRanges?: Array<{ from: number; to: number }>;
}) {
  const lines = args.text.split('\n');
  return {
    state: {
      doc: {
        lineAt(position: number) {
          let from = 0;
          for (let index = 0; index < lines.length; index += 1) {
            const to = from + (lines[index]?.length ?? 0);
            if (position <= to || index === lines.length - 1) {
              return { from, number: index + 1, text: lines[index] ?? '', to };
            }
            from = to + 1;
          }
          return { from: 0, number: 1, text: lines[0] ?? '', to: lines[0]?.length ?? 0 };
        },
        lines: lines.length
      }
    },
    viewport: args.viewport,
    visibleRanges: args.visibleRanges ?? []
  };
}

describe('resolveVisibleLineWindow', () => {
  it('uses the rendered viewport so inline markdown is planned before visible range catches up', () => {
    const text = ['one', '**two**', '**three**', '**four**'].join('\n');
    const viewportFrom = text.indexOf('**two**');
    const viewportTo = text.indexOf('**four**') + '**four**'.length;
    const visibleFrom = text.indexOf('**three**');
    const visibleTo = visibleFrom + '**three**'.length;

    expect(
      resolveVisibleLineWindow(createMockView({
        text,
        viewport: { from: viewportFrom, to: viewportTo },
        visibleRanges: [{ from: visibleFrom, to: visibleTo }]
      }) as never)
    ).toEqual({ endLineNumber: 4, startLineNumber: 2 });
  });

  it('falls back to visible ranges when viewport is empty', () => {
    const text = ['one', 'two', 'three'].join('\n');
    const visibleFrom = text.indexOf('two');
    const visibleTo = visibleFrom + 'two'.length;

    expect(
      resolveVisibleLineWindow(createMockView({
        text,
        viewport: { from: 0, to: 0 },
        visibleRanges: [{ from: visibleFrom, to: visibleTo }]
      }) as never)
    ).toEqual({ endLineNumber: 2, startLineNumber: 2 });
  });
});

describe('shouldRefreshLineDecorations', () => {
  it('refreshes line decorations when focus changes so cursor-line image previews can update', () => {
    expect(
      shouldRefreshLineDecorations({
        docChanged: false,
        focusChanged: true,
        selectionSet: false,
        viewportChanged: false
      } as never, 12, null)
    ).toBe(true);
  });

  it('skips line decoration rebuild when selection changes inside the same line', () => {
    expect(
      shouldRefreshLineDecorations({
        docChanged: false,
        focusChanged: false,
        selectionSet: true,
        viewportChanged: false
      } as never, 12, 12)
    ).toBe(false);
  });

  it('refreshes line decorations when selection moves to another line', () => {
    expect(
      shouldRefreshLineDecorations({
        docChanged: false,
        focusChanged: false,
        selectionSet: true,
        viewportChanged: false
      } as never, 12, 13)
    ).toBe(true);
  });
});
