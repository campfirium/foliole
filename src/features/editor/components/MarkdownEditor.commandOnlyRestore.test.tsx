import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockRestoreSelection = vi.fn();

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
    setScrollTop() {}
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
    wrapper: ({ children }) => (
      <LocalizationProvider>
        <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
      </LocalizationProvider>
    )
  });
}

beforeEach(() => {
  mockRestoreSelection.mockClear();
});

it('does not restore from persisted node view state without an explicit command', () => {
  const view = renderEditor(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="Body" />);

  view.rerender(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      value={'Long body\n\n'.repeat(8_000)}
    />
  );

  expect(mockRestoreSelection).not.toHaveBeenCalled();
});
