import type { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';

const { importClipboardImageAttachment } = vi.hoisted(() => ({
  importClipboardImageAttachment: vi.fn()
}));

vi.mock('../../../shared/platform/attachmentImports', () => ({
  importClipboardImageAttachment
}));

import { serializeStructuredClipboardPayload } from '../model/anchorClipboardPayload';

import { FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';
import { handleClipboardImagePaste, handleInternalClipboardPaste, handleMarkdownCompatibleHtmlPaste } from './htmlPaste';
import { activeNodeIdFacet, pastedAnchorsFacet } from './liveMarkdownState';

function createPasteView(overrides?: {
  facet?: (facet: unknown) => unknown;
  from?: number;
  to?: number;
}) {
  const dispatch = vi.fn();
  const facet = overrides?.facet ?? (() => null);
  return {
    dispatch,
    state: {
      doc: { toString: () => 'Before important after' },
      facet,
      selection: { main: { from: overrides?.from ?? 0, to: overrides?.to ?? 0 } }
    }
  } as unknown as EditorView;
}

function createAnchorFacet(onPastedAnchors: ReturnType<typeof vi.fn>) {
  return (facet: unknown) => {
    if (facet === activeNodeIdFacet) return 'node-1';
    if (facet === pastedAnchorsFacet) return onPastedAnchors;
    return null;
  };
}

describe('handleInternalClipboardPaste', () => {
  it('restores the internal markdown payload when the custom clipboard mime exists', () => {
    const onPastedAnchors = vi.fn();
    const view = createPasteView({
      facet: (facet) => {
        if (facet === activeNodeIdFacet) return 'node-1';
        if (facet === pastedAnchorsFacet) return onPastedAnchors;
        return null;
      },
      from: 1,
      to: 4
    });

    expect(
      handleInternalClipboardPaste(
        {
          getData: (format: string) =>
            format === FOLIOLE_CLIPBOARD_MIME
              ? serializeStructuredClipboardPayload({
                  anchors: [{ from: 0, kind: 'highlight', to: 5 }],
                  internalText: 'hello'
                })
              : ''
        },
        view
      )
    ).toBe(true);

    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 1, insert: 'hello', to: 4 },
      selection: { anchor: 6 }
    });
    expect(onPastedAnchors).toHaveBeenCalledWith({
      anchors: [{ from: 1, kind: 'highlight', to: 6 }],
      content: 'Before important after',
      nodeId: 'node-1'
    });
  });

  it('keeps backward compatibility with raw internal clipboard text', () => {
    const view = createPasteView({ from: 1, to: 4 });

    expect(
      handleInternalClipboardPaste(
        {
          getData: (format: string) => (format === FOLIOLE_CLIPBOARD_MIME ? '![Cover](asset://hash-1.png)' : '')
        },
        view
      )
    ).toBe(true);

    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 1, insert: '![Cover](asset://hash-1.png)', to: 4 },
      selection: { anchor: 29 }
    });
  });
});

describe('handleMarkdownCompatibleHtmlPaste', () => {
  it('converts clipboard HTML into markdown-compatible text before insertion', () => {
    const view = createPasteView({ from: 2, to: 5 });
    const clipboard = {
      getData: (format: string) => (format === 'text/html' ? '<p><strong>Bold</strong> text</p>' : '')
    };

    expect(handleMarkdownCompatibleHtmlPaste(clipboard, view)).toBe(true);
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 2, insert: '**Bold** text', to: 5 },
      selection: { anchor: 15 }
    });
  });

  it('leaves plain text paste untouched when clipboard has no HTML', () => {
    const view = createPasteView();

    expect(handleMarkdownCompatibleHtmlPaste({ getData: () => '' }, view)).toBe(false);
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('keeps degraded HTML structures visible during rich text paste', () => {
    const view = createPasteView();
    const clipboard = {
      getData: (format: string) =>
        format === 'text/html'
          ? '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>Beta</td></tr></table><iframe src="https://example.com/embed"></iframe>'
          : ''
    };

    expect(handleMarkdownCompatibleHtmlPaste(clipboard, view)).toBe(true);
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: {
        from: 0,
        insert: '[Table degraded]\nName | Value\nAlpha | Beta\n\n[Embedded iframe: https://example.com/embed]',
        to: 0
      },
      selection: { anchor: 88 }
    });
  });

  it('converts external marked text into plain text and pasted anchors', () => {
    const onPastedAnchors = vi.fn();
    const view = createPasteView({
      facet: createAnchorFacet(onPastedAnchors)
    });
    const clipboard = {
      getData: (format: string) => (format === 'text/plain' ? 'Before ==important== and <u>hidden</u>' : '')
    };

    expect(handleMarkdownCompatibleHtmlPaste(clipboard, view)).toBe(true);
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 0, insert: 'Before important and hidden', to: 0 },
      selection: { anchor: 27 }
    });
    expect(onPastedAnchors).toHaveBeenCalledWith({
      anchors: [
        { from: 7, kind: 'highlight', to: 16 },
        { from: 21, kind: 'cloze', to: 27 }
      ],
      content: 'Before important after',
      nodeId: 'node-1'
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
        changes: { from: 0, to: 0, insert: placeholder }
      })
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        changes: { from: 0, to: placeholder.length, insert: '![clip](asset://hash-1.png)' }
      })
    );
    randomUUIDSpy.mockRestore();
  });
});
