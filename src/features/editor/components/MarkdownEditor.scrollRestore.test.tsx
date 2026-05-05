import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockRestoreSelection = vi.fn();
const mockSetScrollTop = vi.fn();

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    destroy() {}
    focus() {}
    getContent() { return ''; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent() {}
    setDiffDecorations() {}
    setTextAnchorDecorations() {}
    setHideTitleHeading() {}
    getSelection() { return { from: 0, to: 0 }; }
    setParagraphMarker() {}
    setSelection() {}
    restoreSelection(selection: { from: number; to: number }) { mockRestoreSelection(selection); }
    revealSelection() {}
    getScrollTop() { return 0; }
    setScrollTop(scrollTop: number) { mockSetScrollTop(scrollTop); }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    replaceRange() {}
    replaceSelection() {}
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderEditor(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

beforeEach(() => {
  mockRestoreSelection.mockClear();
  mockSetScrollTop.mockClear();
});

it('restores saved scroll position even when the saved selection stays at the document start', async () => {
  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 0, to: 0 } }}
      onChange={vi.fn()}
      value={'Paragraph\n\n'.repeat(200)}
    />
  );

  expect(mockRestoreSelection).toHaveBeenLastCalledWith({ from: 0, to: 0 });
  await waitFor(() => {
    expect(mockSetScrollTop).toHaveBeenLastCalledWith(5_400);
  });
});
