import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from '../features/editor/adapters/CodeMirrorEditorAdapter';

import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function selectedArticle() {
  const article = document.createElement('div');
  article.dataset.companionReadableDocument = 'true';
  article.textContent = 'Selected text and unselected text';
  const outside = document.createElement('span');
  outside.textContent = 'Outside';
  article.append(outside);
  document.body.append(article);
  let selected = true;
  const nativeSelection = {
    anchorNode: article.firstChild,
    anchorOffset: 0,
    focusNode: article.firstChild,
    focusOffset: 8,
    getRangeAt: () => ({
      getClientRects: () => [{ left: 10, right: 90, top: 10, bottom: 30 }]
    }),
    get isCollapsed() { return !selected; },
    get rangeCount() { return selected ? 1 : 0; },
    removeAllRanges: vi.fn(() => { selected = false; }),
    toString: () => selected ? 'Selected' : ''
  };
  vi.spyOn(window, 'getSelection').mockReturnValue(nativeSelection as unknown as Selection);
  let editorSelection = { from: 0, to: 8 };
  const editor = {
    getContent: vi.fn(() => 'Selected text and unselected text'),
    getSelection: vi.fn(() => editorSelection),
    getSelectionRanges: vi.fn(() => [editorSelection]),
    setSelection: vi.fn((selection: { from: number; to: number }) => { editorSelection = selection; })
  };
  return { article, editor, nativeSelection, outside };
}

function touch(target: Element, name: string, clientX: number, clientY: number) {
  target.dispatchEvent(new MouseEvent(name, { bubbles: true, clientX, clientY }));
}

it('clears a surviving native and editor selection after tapping outside it', () => {
  const { editor, nativeSelection, outside } = selectedArticle();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1; });
  const { result } = renderHook(() => useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: true, nodeId: 'node-1', snapshot: null
  }));
  act(() => {
    result.current.handleEditorReady(editor as never);
    touch(outside, 'pointerdown', 140, 20);
  });
  act(() => {
    touch(outside, 'pointerup', 140, 20);
    result.current.openSelectionToolbar({ clientX: 140, clientY: 20, target: outside } as never);
  });
  expect(nativeSelection.removeAllRanges).toHaveBeenCalledOnce();
  expect(editor.setSelection).toHaveBeenCalledWith({ from: 8, to: 8 });
  expect(result.current.selectionToolbar).toBeNull();
});

it.each([
  ['the selected text', 50, 20, 'pointerup'],
  ['a drag', 140, 20, 'pointermove']
])('preserves the selection after touching %s', (_label, x, y, lastEvent) => {
  const { editor, nativeSelection, outside } = selectedArticle();
  const { result } = renderHook(() => useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: true, nodeId: 'node-1', snapshot: null
  }));
  act(() => {
    result.current.handleEditorReady(editor as never);
    touch(outside, 'pointerdown', x as number, y as number);
  });
  act(() => {
    if (lastEvent === 'pointermove') touch(outside, 'pointermove', 170, 20);
    touch(outside, 'pointerup', 170, 20);
  });
  expect(nativeSelection.removeAllRanges).not.toHaveBeenCalled();
  expect(editor.setSelection).not.toHaveBeenCalled();
});

it.each(['a', '.cm-md-highlight'])('leaves %s targets to their existing action', (selector) => {
  const { article, editor, nativeSelection } = selectedArticle();
  const target = document.createElement(selector === 'a' ? 'a' : 'span');
  if (selector !== 'a') target.className = selector.slice(1);
  article.append(target);
  const { result } = renderHook(() => useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: true, nodeId: 'node-1', snapshot: null
  }));
  act(() => {
    result.current.handleEditorReady(editor as never);
    touch(target, 'pointerdown', 140, 20);
  });
  act(() => touch(target, 'pointerup', 140, 20));
  expect(nativeSelection.removeAllRanges).not.toHaveBeenCalled();
});

it('collapses a real read-only editor selection after an outside pointer tap', () => {
  const article = document.createElement('section');
  article.dataset.companionReadableDocument = 'true';
  const host = document.createElement('div');
  const outside = document.createElement('span');
  article.append(host, outside);
  document.body.append(article);
  const editor = new CodeMirrorEditorAdapter(host, { initialContent: 'Selected text and unselected text', readOnly: true });
  // jsdom has no layout coordinates; keep the real editor selection state.
  vi.spyOn(editor, 'getDocumentPositionAtClientPoint').mockReturnValue(null);
  editor.setSelection({ from: 0, to: 8 });
  const { result, unmount } = renderHook(() => useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: true, nodeId: 'node-1', snapshot: null
  }));
  act(() => {
    result.current.handleEditorReady(editor);
    touch(outside, 'pointerdown', 140, 20);
  });
  act(() => touch(outside, 'pointerup', 140, 20));
  expect(editor.getSelection()).toEqual({ from: 8, to: 8 });
  expect(editor.getContent()).toBe('Selected text and unselected text');
  unmount();
  editor.destroy();
});
