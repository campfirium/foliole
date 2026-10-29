import { beforeEach, describe, expect, it, vi } from 'vitest';

import { folioleMarkdownLanguageExtensions } from '../model/folioleMarkdownParser';

import {
  mockMarkdown,
  mockCompartmentReconfigure,
  mockScrollIntoView,
  mockEditorStateCreate,
  mockEditorView,
  mockDomEventHandlers,
  mockReadOnlyOf,
  mockEditableOf,
  mockAllowMultipleSelectionsOf
} from './codeMirrorAdapter.test-support';
import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function resetEditorMocks() {
  mockCompartmentReconfigure.mockClear();
  mockScrollIntoView.mockClear();
  mockEditorStateCreate.mockClear();
  mockEditorView.mockClear();
  mockDomEventHandlers.mockClear();
  mockReadOnlyOf.mockClear();
  mockEditableOf.mockClear();
  mockAllowMultipleSelectionsOf.mockClear();
}

function createAdapterWithStubbedView() {
  const adapter = new CodeMirrorEditorAdapter(document.createElement('div'), {
    initialContent: 'abc'
  });
  const dispatch = vi.fn();
  const focus = vi.fn();

  Object.assign(adapter as object, {
    view: {
      requestMeasure: vi.fn(),
      state: { doc: { length: 20 } },
      scrollDOM: {
        addEventListener: () => undefined,
        clientHeight: 200,
        removeEventListener: () => undefined,
        scrollHeight: 500,
        scrollTop: 0
      },
      lineBlockAt: vi.fn(() => ({ height: 24 })),
      coordsAtPos: vi.fn(() => null),
      dispatch,
      focus
    }
  });

  return { adapter, dispatch, focus };
}

describe('CodeMirrorEditorAdapter construction', () => {
  beforeEach(() => {
    resetEditorMocks();
    vi.useRealTimers();
  });

  it('uses native browser selection so wrapped text selections stay glyph-bound', () => {
    new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc'
    });

    expect(mockAllowMultipleSelectionsOf).toHaveBeenCalledWith(true);
    const extensions = mockEditorStateCreate.mock.calls[0]?.[0]?.extensions;
    expect(extensions).not.toContain('draw-selection-extension');
    expect(extensions).toContain('allow-multiple-selections-extension');
  });

  it('uses the maintained GFM markdown language baseline', () => {
    new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc'
    });

    expect(mockMarkdown).toHaveBeenCalledWith({
      base: {
        parser: {
          configure: expect.any(Function)
        }
      },
      extensions: folioleMarkdownLanguageExtensions
    });
  });

  it('keeps read-only editors selectable so comparison panes can copy text', () => {
    new CodeMirrorEditorAdapter(document.createElement('div'), {
      initialContent: 'abc',
      readOnly: true
    });

    expect(mockReadOnlyOf).toHaveBeenCalledWith(true);
    expect(mockEditableOf).toHaveBeenCalledWith(false);
  });
});

describe('CodeMirrorEditorAdapter selection behavior', () => {
  it('can reveal a document position without changing selection', () => {
    const { adapter, dispatch, focus } = createAdapterWithStubbedView();

    adapter.revealPosition(8);

    expect(mockScrollIntoView).toHaveBeenCalledWith(8, { y: 'center' });
    expect(dispatch).toHaveBeenCalledWith({ effects: 'scroll-into-view-effect' });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('can restore selection without forcing focus alignment work', () => {
    const { adapter, dispatch, focus } = createAdapterWithStubbedView();

    adapter.restoreSelection({ from: 8, to: 10 });

    expect(dispatch).toHaveBeenCalledWith({
      scrollIntoView: true,
      selection: { anchor: 8, head: 10 }
    });
    expect(focus).not.toHaveBeenCalled();
  });

  it('can toggle paragraph marker styling on the editor host', () => {
    const host = document.createElement('div');
    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: 'Alpha\nBeta'
    });

    Object.assign(adapter as object, {
      view: {
        dispatch: vi.fn(),
        dom: host,
        state: {
          doc: {
            length: 10,
            line: (lineNumber: number) => (lineNumber === 1 ? { from: 0 } : { from: 6 }),
            lineAt: (position: number) => (position <= 5 ? { from: 0, number: 1 } : { from: 6, number: 2 })
          }
        }
      }
    });

    adapter.setParagraphMarker({ from: 0, to: 5 });
    expect(host.dataset.paragraphMarkerActive).toBe('true');

    adapter.setParagraphMarker(null);
    expect(host.dataset.paragraphMarkerActive).toBe('false');
  });
});
