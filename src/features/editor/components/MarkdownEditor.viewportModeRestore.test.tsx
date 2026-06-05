import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const mockRestoreSelection = vi.fn();
const mockRevealSelectionAtViewportRatio = vi.fn();
const mockRevealSelectionCentered = vi.fn();

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
    revealSelectionCentered(selection: { from: number; to: number }) { mockRevealSelectionCentered(selection); }
    revealSelectionAtViewportRatio(selection: { from: number; to: number }, ratio: number) {
      mockRevealSelectionAtViewportRatio(selection, ratio);
    }
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

function createLongDocument() {
  return Array.from({ length: 2_500 }, (_, index) => `Paragraph ${index}: ${'Long document body. '.repeat(4)}`).join('\n\n');
}

beforeEach(() => {
  mockRestoreSelection.mockClear();
  mockRevealSelectionAtViewportRatio.mockClear();
  mockRevealSelectionCentered.mockClear();
});

it('reveals a centered reading restore without viewport-ratio alignment', async () => {
  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      readingRestoreCommandId="mode-center-1"
      readingSelection={{ from: 48_000, to: 48_024 }}
      readingTargetViewportMode="center"
      value={createLongDocument()}
    />
  );

  await waitFor(() => {
    expect(mockRevealSelectionCentered).toHaveBeenCalledWith({ from: 48_000, to: 48_000 });
  });
  expect(mockRestoreSelection).not.toHaveBeenCalled();
  expect(mockRevealSelectionAtViewportRatio).not.toHaveBeenCalled();
});

it('reveals a nearest reading restore without plain restore selection', async () => {
  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      readingRestoreCommandId="mode-nearest-1"
      readingSelection={{ from: 48_000, to: 48_024 }}
      readingTargetViewportMode="nearest"
      value={createLongDocument()}
    />
  );

  await waitFor(() => {
    expect(mockRestoreSelection).toHaveBeenCalledWith({ from: 48_000, to: 48_000 });
  });
  expect(mockRevealSelectionAtViewportRatio).not.toHaveBeenCalled();
});
