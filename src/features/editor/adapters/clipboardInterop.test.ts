import { describe, expect, it } from 'vitest';

import { createMockEditorView } from '../../../test/codeMirrorEditorViewTestSupport';

import { createClipboardExportFromView, createClipboardExportPayload, FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';
import { textAnchorDecorationsFacet } from './liveMarkdownState';

function createClipboardView() {
  return createMockEditorView({
    state: {
      doc: {
        lineAt: () => ({ number: 1 }),
        line: () => ({ from: 0, text: 'Before important after' }),
        sliceString: (from: number, to: number) => 'Before important after'.slice(from, to)
      },
      facet: (facet: unknown) => (facet === textAnchorDecorationsFacet ? [{ from: 7, kind: 'highlight', to: 16 }] : null),
      selection: {
        ranges: [{ empty: false, from: 0, to: 22 }]
      }
    }
  });
}

describe('clipboardInterop', () => {
  it('keeps internal markdown and exports attachment paths for external paste', () => {
    const payload = createClipboardExportPayload(
      'Before ![Cover](asset://hash-1.png) after',
      null,
      '/Users/tester/Documents/Foliole/Assets'
    );

    expect(payload).toEqual({
      internalAnchors: [],
      internalText: 'Before ![Cover](asset://hash-1.png) after',
      externalText: 'Before ![Cover](file:///Users/tester/Documents/Foliole/Assets/hash-1.png) after',
      externalHtml:
        '<p>Before <img alt="Cover" src="file:///Users/tester/Documents/Foliole/Assets/hash-1.png"> after</p>'
    });
  });

  it('prefers the expanded markdown selection for external export only', () => {
    const payload = createClipboardExportPayload('[label](https://example.com)', '[label](https://example.com)', null);

    expect(payload?.internalText).toBe('[label](https://example.com)');
    expect(payload?.externalText).toBe('[label](https://example.com)');
  });

  it('uses the documented custom mime type for internal clipboard data', () => {
    expect(FOLIOLE_CLIPBOARD_MIME).toBe('application/x-foliole');
  });

  it('rebuilds external highlight markers from locator-backed decorations', () => {
    const payload = createClipboardExportFromView(createClipboardView());

    expect(payload?.internalAnchors).toEqual([{ from: 7, kind: 'highlight', to: 16 }]);
    expect(payload?.internalText).toBe('Before important after');
    expect(payload?.externalText).toBe('Before ==important== after');
    expect(payload?.externalHtml).toBe('<p>Before <mark>important</mark> after</p>');
  });
});
