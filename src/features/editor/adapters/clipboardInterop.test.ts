import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockEditorView } from '../../../test/codeMirrorEditorViewTestSupport';

const runtimeLibraryPaths = vi.hoisted(() => ({
  read: vi.fn<() => { assetsDir: string } | null>(() => null)
}));

vi.mock('../../../shared/platform/libraryPathSettingsCache', () => ({
  readRuntimeLibraryPathSettingsCache: runtimeLibraryPaths.read
}));

import { createClipboardExportFromView, createClipboardExportPayload, FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';
import { textAnchorDecorationsFacet } from './liveMarkdownState';

const IMAGE_HASH = 'a'.repeat(64);

function createClipboardView(text = 'Before important after', withHighlight = true) {
  return createMockEditorView({
    state: {
      doc: {
        lineAt: () => ({ number: 1 }),
        line: () => ({ from: 0, text }),
        sliceString: (from: number, to: number) => text.slice(from, to)
      },
      facet: (facet: unknown) => facet === textAnchorDecorationsFacet && withHighlight
        ? [{ from: 7, kind: 'highlight', to: 16 }]
        : null,
      selection: {
        ranges: [{ empty: false, from: 0, to: text.length }]
      }
    }
  });
}

describe('clipboardInterop', () => {
  beforeEach(() => {
    runtimeLibraryPaths.read.mockReset();
    runtimeLibraryPaths.read.mockReturnValue(null);
  });

  it('does not read library paths while the clipboard module loads', () => {
    expect(runtimeLibraryPaths.read).not.toHaveBeenCalled();
  });

  it('keeps internal markdown and exports attachment paths for external paste', () => {
    const payload = createClipboardExportPayload(
      `Before ![Cover](asset://${IMAGE_HASH}.png) after`,
      null,
      '/Users/tester/Documents/Foliole/Assets'
    );

    expect(payload).toEqual({
      internalAnchors: [],
      internalText: `Before ![Cover](asset://${IMAGE_HASH}.png) after`,
      externalText: `Before ![Cover](file:///Users/tester/Documents/Foliole/Assets/${IMAGE_HASH}.png) after`,
      externalHtml:
        `<p>Before <img alt="Cover" src="file:///Users/tester/Documents/Foliole/Assets/${IMAGE_HASH}.png"> after</p>`
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

  it('uses the current hydrated assets path for every canonical asset export', () => {
    const markdown = `![Cover](asset://${IMAGE_HASH}.png)`;
    runtimeLibraryPaths.read.mockReturnValueOnce({ assetsDir: '/library-one/Assets' });
    runtimeLibraryPaths.read.mockReturnValueOnce({ assetsDir: '/library-two/Assets' });

    const first = createClipboardExportFromView(createClipboardView(markdown, false));
    const second = createClipboardExportFromView(createClipboardView(markdown, false));

    expect(first?.externalText).toContain(`file:///library-one/Assets/${IMAGE_HASH}.png`);
    expect(second?.externalText).toContain(`file:///library-two/Assets/${IMAGE_HASH}.png`);
    expect(first?.internalText).toBe(markdown);
    expect(second?.internalText).toBe(markdown);
    expect(runtimeLibraryPaths.read).toHaveBeenCalledTimes(2);
  });
});
