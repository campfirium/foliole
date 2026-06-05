import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';
import type { EditorScrollEvent } from '../adapters/EditorAdapter';

const mockRestoreSelection = vi.fn();
const mockSetScrollTop = vi.fn();
const scrollListeners = new Set<(event: EditorScrollEvent) => void>();
let currentContent = '';
let currentScrollTop = 0;

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor(_host: HTMLElement, options?: { initialContent?: string }) {
      currentContent = options?.initialContent ?? '';
      currentScrollTop = 0;
    }
    destroy() {}
    focus() {}
    getContent() { return currentContent; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent(content: string) { currentContent = content; }
    setDiffDecorations() {}
    setTextAnchorDecorations() {}
    setHideTitleHeading() {}
    getSelection() { return { from: 0, to: 0 }; }
    setParagraphMarker() {}
    setSelection() {}
    restoreSelection(selection: { from: number; to: number }) { mockRestoreSelection(selection); }
    revealSelection() {}
    getScrollTop() { return currentScrollTop; }
    setScrollTop(scrollTop: number) { currentScrollTop = scrollTop; mockSetScrollTop(scrollTop); }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: currentScrollTop }; }
    replaceRange() {}
    replaceSelection() {}
    onContentChange() { return () => undefined; }
    onScroll(listener: (event: EditorScrollEvent) => void) {
      scrollListeners.add(listener);
      return () => scrollListeners.delete(listener);
    }
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-13T00:00:00.000Z'));
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle: number) => window.clearTimeout(handle));
  mockRestoreSelection.mockClear();
  mockSetScrollTop.mockClear();
  scrollListeners.clear();
  currentContent = '';
  currentScrollTop = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('does not pull the editor back when a user scroll interrupts a pending restore', () => {
  const onCompleteApplyingReadingPosition = vi.fn();
  renderEditor(
    <MarkdownEditor
      nodeId="node-1"
      nodeViewState={{ scrollTop: 5_400, selection: { from: 48_000, to: 48_024 } }}
      onChange={vi.fn()}
      onCompleteApplyingReadingPosition={onCompleteApplyingReadingPosition}
      readingRestoreCommandId="interrupt-restore-1"
      readingRestoreScrollTop={5_400}
      readingSelection={{ from: 48_000, to: 48_024 }}
      value={createLongDocument()}
    />
  );
  expect(mockRestoreSelection).toHaveBeenCalledWith({ from: 48_000, to: 48_000 });
  expect(mockSetScrollTop).toHaveBeenCalledWith(5_400);
  expect(scrollListeners.size).toBe(1);

  mockSetScrollTop.mockClear();
  currentScrollTop = 5_920;
  vi.setSystemTime(new Date('2026-05-13T00:00:00.100Z'));
  act(() => {
    for (const listener of scrollListeners) {
      listener({ userInitiated: true });
    }
    vi.runOnlyPendingTimers();
  });

  expect(mockSetScrollTop).not.toHaveBeenCalled();
  expect(currentScrollTop).toBe(5_920);
  expect(onCompleteApplyingReadingPosition).toHaveBeenCalledWith('editor-restore-selection-user-interrupted', undefined, 'interrupt-restore-1');
});
