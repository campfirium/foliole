import { render } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockDestroy = vi.fn();
const mockResizeObserver = vi.fn();

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor() {}
    destroy() { mockDestroy(); }
    focus() {}
    getContent() { return ''; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent() {}
    setDiffDecorations() {}
    setSearchDecorations() {}
    setTextAnchorDecorations() {}
    setHideTitleHeading() {}
    setNodeId() {}
    refreshImageClozePresentation() {}
    getSelection() { return { from: 0, to: 0 }; }
    setParagraphMarker() {}
    setSelection() {}
    restoreSelection() {}
    revealSelection() {}
    getScrollTop() { return 0; }
    setScrollTop() {}
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    replaceSelection() {}
    replaceRange() {}
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderWithMouseGestureProvider(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <LocalizationProvider>
        <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
      </LocalizationProvider>
    )
  });
}

function createResizeObserverMock() {
  mockResizeObserver();
  return {
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn()
  };
}

describe('MarkdownEditor image effects', () => {
  beforeEach(() => {
    mockDestroy.mockClear();
    mockResizeObserver.mockClear();
    vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(createResizeObserverMock));
  });

  it('does not recreate image observers when only non-image text changes', () => {
    const view = renderWithMouseGestureProvider(
      <MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={vi.fn()} value="Alpha\n![Cover](asset://cover.png)" />
    );

    expect(mockResizeObserver).toHaveBeenCalledTimes(1);

    view.rerender(
      <MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={vi.fn()} value="Alpha beta\n![Cover](asset://cover.png)" />
    );

    expect(mockResizeObserver).toHaveBeenCalledTimes(1);
  });

  it('starts a new image observation cycle when image references change', () => {
    const view = renderWithMouseGestureProvider(
      <MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={vi.fn()} value="![Cover](asset://cover-a.png)" />
    );

    expect(mockResizeObserver).toHaveBeenCalledTimes(1);

    view.rerender(<MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={vi.fn()} value="![Cover](asset://cover-b.png)" />);

    expect(mockResizeObserver).toHaveBeenCalledTimes(2);
  });

  it('does not start image observers for plain text', () => {
    const view = renderWithMouseGestureProvider(<MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={vi.fn()} value="plain text" />);

    view.rerender(<MarkdownEditor fitBlockImagesToViewport nodeId="node-1" onChange={vi.fn()} value="plain text updated" />);

    expect(mockResizeObserver).not.toHaveBeenCalled();
  });
});
