import { describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import { scrollReviewReadingSurface } from './reviewReadingScrollCommand';

function createEditor(overrides: {
  clientHeight?: number;
  scrollHeight?: number;
  scrollTop?: number;
}) {
  const setScrollTop = vi.fn();
  return {
    getScrollMetrics: () => ({
      clientHeight: overrides.clientHeight ?? 500,
      scrollHeight: overrides.scrollHeight ?? 1500,
      scrollTop: overrides.scrollTop ?? 0
    }),
    setScrollTop
  } as unknown as EditorAdapter;
}

describe('scrollReviewReadingSurface', () => {
  it('scrolls down and up by a page-like distance', () => {
    const downEditor = createEditor({ clientHeight: 500, scrollTop: 100 });
    const upEditor = createEditor({ clientHeight: 500, scrollTop: 600 });

    expect(scrollReviewReadingSurface(downEditor, 'down')).toBe(true);
    expect(scrollReviewReadingSurface(upEditor, 'up')).toBe(true);

    expect(downEditor.setScrollTop).toHaveBeenCalledWith(525);
    expect(upEditor.setScrollTop).toHaveBeenCalledWith(175);
  });

  it('returns false without consuming when there is no scroll room', () => {
    const editor = createEditor({ clientHeight: 500, scrollHeight: 500 });

    expect(scrollReviewReadingSurface(editor, 'down')).toBe(false);
    expect(editor.setScrollTop).not.toHaveBeenCalled();
  });
});
