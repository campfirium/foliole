import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockSetContent = vi.fn();
const mockSetTextAnchorDecorations = vi.fn();
let currentContent = '';

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor(_host: HTMLElement, options?: { initialContent?: string }) {
      currentContent = options?.initialContent ?? '';
    }
    destroy() {}
    focus() {}
    getContent() { return currentContent; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    getScrollTop() { return 0; }
    getSelection() { return { from: 0, to: 0 }; }
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
    replaceRange() {}
    replaceSelection() {}
    restoreSelection() {}
    revealSelection() {}
    setContent(content: string) { currentContent = content; mockSetContent(content); }
    setDiffDecorations() {}
    setHideTitleHeading() {}
    setParagraphMarker() {}
    setScrollTop() {}
    setSelection() {}
    setTextAnchorDecorations(textAnchorDecorations: unknown) { mockSetTextAnchorDecorations(textAnchorDecorations); }
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

it('applies node-switch text anchor decorations only after the new content is in place', () => {
  vi.useFakeTimers();
  const requestAnimationFrameSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  const cancelAnimationFrameSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((handle: number) => window.clearTimeout(handle));

  try {
    const onChange = vi.fn();
    const view = renderWithProvider(
      <MarkdownEditor nodeId="node-child" onChange={onChange} textAnchorDecorations={[]} value="Beta" />
    );

    mockSetContent.mockClear();
    mockSetTextAnchorDecorations.mockClear();

    act(() => {
      view.rerender(
        <MarkdownEditor
          nodeId="node-parent"
          onChange={onChange}
          textAnchorDecorations={[{ from: 6, kind: 'highlight', to: 10 }]}
          value="Alpha Beta Gamma"
        />
      );
    });

    expect(mockSetContent).toHaveBeenCalledWith('Alpha Beta Gamma');
    expect(mockSetTextAnchorDecorations).not.toHaveBeenCalled();

    act(() => {
      vi.runAllTimers();
    });

    expect(mockSetTextAnchorDecorations).toHaveBeenCalledWith([{ from: 6, kind: 'highlight', to: 10 }]);
  } finally {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    vi.useRealTimers();
  }
});
