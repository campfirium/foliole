import { describe, expect, it } from 'vitest';

import { shouldRefreshLineDecorations } from './liveMarkdownViewport';

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
