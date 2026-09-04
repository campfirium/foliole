import { describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import { createPaletteDocumentScrollActions } from './appPaletteDocumentScrollActions';

function createEditor(metrics: { clientHeight: number; scrollHeight: number; scrollTop: number }) {
  return {
    getScrollMetrics: vi.fn(() => metrics),
    setScrollTop: vi.fn()
  } as unknown as EditorAdapter;
}

describe('createPaletteDocumentScrollActions', () => {
  it('scrolls the current editor through the shared command action', () => {
    const editor = createEditor({ clientHeight: 300, scrollHeight: 1200, scrollTop: 400 });
    const actions = createPaletteDocumentScrollActions({ current: editor });
    expect(actions.scrollDocumentTop()).toBe(true);
    expect(actions.scrollDocumentBottom()).toBe(true);
    expect(editor.setScrollTop).toHaveBeenNthCalledWith(1, 0);
    expect(editor.setScrollTop).toHaveBeenNthCalledWith(2, 900);
  });

  it('fails closed without a scrollable main document editor', () => {
    expect(createPaletteDocumentScrollActions({ current: null }).scrollDocumentTop()).toBe(false);
    const editor = createEditor({ clientHeight: 300, scrollHeight: 300, scrollTop: 0 });
    expect(createPaletteDocumentScrollActions({ current: editor }).scrollDocumentBottom()).toBe(
      false
    );
    expect(editor.setScrollTop).not.toHaveBeenCalled();
  });
});
