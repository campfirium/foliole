import type { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';

import { handleMarkdownCompatibleHtmlPaste } from './htmlPaste';

describe('handleMarkdownCompatibleHtmlPaste', () => {
  it('converts clipboard HTML into markdown-compatible text before insertion', () => {
    const dispatch = vi.fn();
    const view = {
      dispatch,
      state: { selection: { main: { from: 2, to: 5 } } }
    } as unknown as EditorView;
    const clipboard = {
      getData: (format: string) => (format === 'text/html' ? '<p><strong>Bold</strong> text</p>' : '')
    };

    expect(handleMarkdownCompatibleHtmlPaste(clipboard, view)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 2, insert: '**Bold** text', to: 5 },
      selection: { anchor: 15 }
    });
  });

  it('leaves plain text paste untouched when clipboard has no HTML', () => {
    const dispatch = vi.fn();
    const view = {
      dispatch,
      state: { selection: { main: { from: 0, to: 0 } } }
    } as unknown as EditorView;

    expect(handleMarkdownCompatibleHtmlPaste({ getData: () => '' }, view)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps degraded HTML structures visible during rich text paste', () => {
    const dispatch = vi.fn();
    const view = {
      dispatch,
      state: { selection: { main: { from: 0, to: 0 } } }
    } as unknown as EditorView;
    const clipboard = {
      getData: (format: string) =>
        format === 'text/html'
          ? '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>Beta</td></tr></table><iframe src="https://example.com/embed"></iframe>'
          : ''
    };

    expect(handleMarkdownCompatibleHtmlPaste(clipboard, view)).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      changes: {
        from: 0,
        insert: '[Table degraded]\nName | Value\nAlpha | Beta\n\n[Embedded iframe: https://example.com/embed]',
        to: 0
      },
      selection: { anchor: 88 }
    });
  });
});
