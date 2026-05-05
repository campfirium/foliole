import type { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';

const { importClipboardImageAttachment } = vi.hoisted(() => ({
  importClipboardImageAttachment: vi.fn()
}));

vi.mock('../../../shared/platform/attachmentImports', () => ({
  importClipboardImageAttachment
}));

import { handleClipboardImagePaste, handleMarkdownCompatibleHtmlPaste } from './htmlPaste';

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

describe('handleClipboardImagePaste', () => {
  it('imports pasted image files and rewrites the placeholder into attachment markdown', async () => {
    const dispatch = vi.fn();
    const placeholder = '<!-- foliole-image-paste:00000000-0000-0000-0000-000000000000 -->';
    const view = {
      dispatch,
      state: { doc: { toString: () => placeholder }, selection: { main: { from: 0, to: 0 } } }
    } as unknown as EditorView;
    const file = new File(['png-bytes'], 'clip.png', { type: 'image/png' });
    const randomUUIDSpy = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-0000-0000-000000000000');

    importClipboardImageAttachment.mockResolvedValue({
      status: 'imported',
      attachment_id: 'hash-1',
      attachment_record: 'created',
      created_at: '2026-03-30T00:00:00.000Z',
      hash: 'hash-1',
      mime_type: 'image/png',
      original_name: 'clip.png',
      size_bytes: 9,
      stored_file: 'created'
    });

    expect(
      handleClipboardImagePaste(
        {
          getData: () => '',
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }]
        },
        view,
        'node-1'
      )
    ).toBe(true);

    await Promise.resolve();
    await Promise.resolve();

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        annotations: expect.anything(),
        changes: { from: 0, to: 0, insert: placeholder }
      })
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        annotations: expect.anything(),
        changes: { from: 0, to: placeholder.length, insert: '![clip](asset://hash-1.png)' }
      })
    );
    randomUUIDSpy.mockRestore();
  });
});
